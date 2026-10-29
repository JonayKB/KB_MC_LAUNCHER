//! Captura la salida de Minecraft y la muestra en una ventana de logs aparte.
//!
//! Cada partida tiene una sesión con las últimas `MAX_LINES` líneas. Las líneas
//! nuevas se envían a la ventana en lotes (evento `game_log`) para no saturar
//! el IPC cuando el juego escribe miles de líneas al arrancar.

use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, Window};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;
use tracing::{info, warn};

const MAX_LINES: usize = 10_000;
const FLUSH_INTERVAL: Duration = Duration::from_millis(120);

#[derive(Debug, Clone, Serialize)]
pub struct LogLine {
    pub seq: u64,
    /// "stdout", "stderr" o "system" (mensajes del propio launcher)
    pub stream: &'static str,
    pub text: String,
}

#[derive(Default)]
struct Session {
    name: String,
    lines: VecDeque<LogLine>,
    next_seq: u64,
    running: bool,
    killed: bool,
    exit_code: Option<i32>,
    started_at: u64,
    kill_tx: Option<oneshot::Sender<()>>,
}

impl Session {
    fn push(&mut self, stream: &'static str, text: String) -> LogLine {
        let line = LogLine { seq: self.next_seq, stream, text };
        self.next_seq += 1;
        self.lines.push_back(line.clone());
        if self.lines.len() > MAX_LINES {
            self.lines.pop_front();
        }
        line
    }
}

/// Sesiones de log por modpack (solo la última partida de cada uno)
#[derive(Default)]
pub struct GameLogs(Mutex<HashMap<String, Session>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogSnapshot {
    modpack_id: String,
    name: String,
    lines: Vec<LogLine>,
    running: bool,
    killed: bool,
    exit_code: Option<i32>,
    started_at: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogBatch {
    modpack_id: String,
    lines: Vec<LogLine>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogStatus {
    modpack_id: String,
    running: bool,
    killed: bool,
    exit_code: Option<i32>,
}

/// Etiqueta de la ventana de logs (las etiquetas solo admiten [a-zA-Z0-9-_/:])
pub fn window_label(modpack_id: &str) -> String {
    let safe: String = modpack_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    format!("logs-{}", safe)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Empieza una sesión nueva (descarta la anterior) y lee stdout/stderr del juego.
/// Devuelve el receptor para detener el juego y la tarea que termina cuando
/// se ha leído toda la salida.
pub fn start_session<O, E>(
    app: &AppHandle,
    modpack_id: &str,
    name: &str,
    stdout: Option<O>,
    stderr: Option<E>,
) -> (oneshot::Receiver<()>, JoinHandle<()>)
where
    O: AsyncRead + Unpin + Send + 'static,
    E: AsyncRead + Unpin + Send + 'static,
{
    let (kill_tx, kill_rx) = oneshot::channel();
    app.state::<GameLogs>().0.lock().unwrap().insert(
        modpack_id.to_string(),
        Session {
            name: name.to_string(),
            running: true,
            started_at: now_ms(),
            kill_tx: Some(kill_tx),
            ..Default::default()
        },
    );

    let (tx, rx) = mpsc::unbounded_channel();
    if let Some(out) = stdout {
        tokio::spawn(read_lines(out, "stdout", tx.clone()));
    }
    if let Some(err) = stderr {
        tokio::spawn(read_lines(err, "stderr", tx.clone()));
    }
    drop(tx);

    let aggregator = tokio::spawn(aggregate(app.clone(), modpack_id.to_string(), rx));
    (kill_rx, aggregator)
}

async fn read_lines<R: AsyncRead + Unpin>(
    reader: R,
    stream: &'static str,
    tx: mpsc::UnboundedSender<(&'static str, String)>,
) {
    let mut reader = BufReader::new(reader);
    let mut buf = Vec::new();
    loop {
        buf.clear();
        match reader.read_until(b'\n', &mut buf).await {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                // En Windows Java no escribe en UTF-8: from_utf8_lossy evita perder la línea
                let text = String::from_utf8_lossy(&buf)
                    .trim_end_matches(['\r', '\n'])
                    .to_string();
                if tx.send((stream, text)).is_err() {
                    break;
                }
            }
        }
    }
}

async fn aggregate(
    app: AppHandle,
    modpack_id: String,
    mut rx: mpsc::UnboundedReceiver<(&'static str, String)>,
) {
    let mut pending = Vec::new();
    let mut ticker = tokio::time::interval(FLUSH_INTERVAL);
    loop {
        tokio::select! {
            msg = rx.recv() => match msg {
                Some((stream, text)) => {
                    let state = app.state::<GameLogs>();
                    let mut sessions = state.0.lock().unwrap();
                    if let Some(session) = sessions.get_mut(&modpack_id) {
                        pending.push(session.push(stream, text));
                    }
                }
                None => {
                    flush(&app, &modpack_id, &mut pending);
                    break;
                }
            },
            _ = ticker.tick() => flush(&app, &modpack_id, &mut pending),
        }
    }
}

fn flush(app: &AppHandle, modpack_id: &str, pending: &mut Vec<LogLine>) {
    if pending.is_empty() {
        return;
    }
    let _ = app.emit(
        "game_log",
        LogBatch {
            modpack_id: modpack_id.to_string(),
            lines: std::mem::take(pending),
        },
    );
}

/// Marca la sesión como terminada y avisa a la ventana de logs.
/// Se llama cuando ya se ha leído toda la salida del proceso.
pub fn finish_session(app: &AppHandle, modpack_id: &str, exit_code: Option<i32>) {
    let (line, status) = {
        let state = app.state::<GameLogs>();
        let mut sessions = state.0.lock().unwrap();
        let Some(session) = sessions.get_mut(modpack_id) else { return };
        session.running = false;
        session.exit_code = exit_code;
        session.kill_tx = None;
        let text = if session.killed {
            "Juego detenido desde el launcher".to_string()
        } else {
            match exit_code {
                Some(0) => "El juego se ha cerrado correctamente".to_string(),
                Some(code) => format!("El juego se ha cerrado con el código {}", code),
                None => "El juego se ha cerrado".to_string(),
            }
        };
        let status = LogStatus {
            modpack_id: modpack_id.to_string(),
            running: false,
            killed: session.killed,
            exit_code,
        };
        (session.push("system", text), status)
    };
    let _ = app.emit(
        "game_log",
        LogBatch { modpack_id: modpack_id.to_string(), lines: vec![line] },
    );
    let _ = app.emit("game_log_status", status);
}

/// Abre (o enfoca, si ya existe) la ventana de logs del modpack
pub fn open_log_window(app: &AppHandle, modpack_id: &str) -> Result<(), String> {
    let name = {
        let state = app.state::<GameLogs>();
        let sessions = state.0.lock().unwrap();
        match sessions.get(modpack_id) {
            Some(s) => s.name.clone(),
            None => return Err("Todavía no hay logs: lanza el juego primero".to_string()),
        }
    };

    let label = window_label(modpack_id);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title(format!("Logs · {}", name))
        .inner_size(980.0, 640.0)
        .min_inner_size(560.0, 360.0)
        .build()
        .map_err(|e| {
            warn!("[game_logs] No se pudo abrir la ventana de logs: {}", e);
            e.to_string()
        })?;
    info!("[game_logs] Ventana de logs abierta para {}", modpack_id);
    Ok(())
}

// ── Comandos ──────────────────────────────────────────────────

/// Logs de la sesión asociada a la ventana que lo pide (por su etiqueta)
#[tauri::command]
pub fn get_game_logs(window: Window, state: State<'_, GameLogs>) -> Option<LogSnapshot> {
    let sessions = state.0.lock().unwrap();
    let (modpack_id, session) = sessions
        .iter()
        .find(|(id, _)| window_label(id) == window.label())?;
    Some(LogSnapshot {
        modpack_id: modpack_id.clone(),
        name: session.name.clone(),
        lines: session.lines.iter().cloned().collect(),
        running: session.running,
        killed: session.killed,
        exit_code: session.exit_code,
        started_at: session.started_at,
    })
}

/// Async a propósito: en Windows, crear una ventana desde un comando síncrono bloquea la app
#[tauri::command]
pub async fn open_game_logs(app: AppHandle, modpack_id: String) -> Result<(), String> {
    open_log_window(&app, &modpack_id)
}

/// Detiene el juego en ejecución. Devuelve false si no estaba en marcha.
#[tauri::command]
pub fn kill_game(state: State<'_, GameLogs>, modpack_id: String) -> bool {
    let mut sessions = state.0.lock().unwrap();
    let Some(session) = sessions.get_mut(&modpack_id) else { return false };
    match session.kill_tx.take() {
        Some(tx) => {
            session.killed = true;
            tx.send(()).is_ok()
        }
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_label_only_uses_allowed_chars() {
        assert_eq!(window_label("my-pack_1.20"), "logs-my-pack_1_20");
    }

    #[test]
    fn session_keeps_last_lines_only() {
        let mut session = Session::default();
        for i in 0..(MAX_LINES + 5) {
            session.push("stdout", i.to_string());
        }
        assert_eq!(session.lines.len(), MAX_LINES);
        assert_eq!(session.lines.front().unwrap().text, "5");
        assert_eq!(session.next_seq, (MAX_LINES + 5) as u64);
    }
}
