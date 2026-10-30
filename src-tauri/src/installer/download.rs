use anyhow::{Context, Result};
use futures_util::StreamExt;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;
use tracing::{error, warn};

use crate::installer::progress::Reporter;
use crate::installer::{http, progress, ProgressPayload};

/// Un fallo de descarga tras agotar los reintentos.
#[derive(Debug, Clone)]
pub struct DownloadFailure {
    pub url: String,
    pub dest: std::path::PathBuf,
    pub error: String,
}

/// Intentos de `download_resumable` (reanuda donde se quedó el anterior)
const RESUMABLE_ATTEMPTS: u32 = 6;

/// Archivo temporal junto al destino final
fn part_path(dest: &Path) -> std::path::PathBuf {
    dest.with_extension(format!(
        "{}.part",
        dest.extension().and_then(|e| e.to_str()).unwrap_or("tmp")
    ))
}

pub async fn download_to(
    url: &str,
    dest: &Path,
    reporter: Option<&Reporter>,
    step_label: &str,
) -> Result<()> {
    // Escribir a un archivo temporal junto al destino final, no al destino directamente
    let tmp_dest = part_path(dest);

    let result = download_to_inner(url, &tmp_dest, reporter, step_label, false).await;

    match result {
        Ok(()) => {
            // Solo renombramos al destino final si la descarga se completó entera
            tokio::fs::rename(&tmp_dest, dest)
                .await
                .context("No se pudo mover el archivo descargado a su destino final")?;
            Ok(())
        }
        Err(e) => {
            // Limpiar el .part corrupto/incompleto para no dejar basura
            let _ = tokio::fs::remove_file(&tmp_dest).await;
            Err(e)
        }
    }
}

/// Un error definitivo del servidor (404, 403...): reintentar no lo arregla
fn is_permanent(err: &anyhow::Error) -> bool {
    err.chain()
        .filter_map(|e| e.downcast_ref::<reqwest::Error>())
        .filter_map(|e| e.status())
        .any(|s| s.is_client_error() && s.as_u16() != 408 && s.as_u16() != 429)
}

/// Para archivos grandes: reintenta y continúa donde se cortó en vez de empezar
/// de cero. Si no llega a completarse, el destino no se toca.
pub async fn download_resumable(
    url: &str,
    dest: &Path,
    reporter: Option<&Reporter>,
    step_label: &str,
) -> Result<()> {
    let tmp_dest = part_path(dest);
    // Un .part de una ejecución anterior puede ser de otra versión del archivo
    let _ = tokio::fs::remove_file(&tmp_dest).await;

    let mut attempt = 1;
    loop {
        match download_to_inner(url, &tmp_dest, reporter, step_label, true).await {
            Ok(()) => {
                return tokio::fs::rename(&tmp_dest, dest)
                    .await
                    .context("No se pudo mover el archivo descargado a su destino final");
            }
            Err(e) if attempt >= RESUMABLE_ATTEMPTS || is_permanent(&e) => {
                let _ = tokio::fs::remove_file(&tmp_dest).await;
                return Err(e);
            }
            Err(e) => {
                warn!("[download_resumable] Intento {}/{}: {:#}", attempt, RESUMABLE_ATTEMPTS, e);
                tokio::time::sleep(Duration::from_millis(retry_delay_ms(attempt))).await;
                attempt += 1;
            }
        }
    }
}

fn retry_delay_ms(attempt: u32) -> u64 {
    if cfg!(test) { 10 } else { 1000 * attempt as u64 }
}

async fn download_to_inner(
    url: &str,
    dest: &Path,
    reporter: Option<&Reporter>,
    step_label: &str,
    resume: bool,
) -> Result<()> {
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await.ok();
    }

    let offset = if resume {
        tokio::fs::metadata(dest).await.map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    // Petición HTTP PRIMERO, archivo se crea DESPUÉS de confirmar respuesta OK
    let mut request = http::client().get(url);
    if offset > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={}-", offset));
    }
    let response = request
        .send()
        .await
        .context("Error en la petición HTTP")?;

    if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
        // Lo que había ya no vale (o estaba completo): se empieza de cero
        let _ = tokio::fs::remove_file(dest).await;
        anyhow::bail!("El servidor rechazó continuar la descarga");
    }
    let response = response
        .error_for_status()
        .context("El servidor devolvió un error")?;

    // Un 200 a una petición con Range trae el archivo entero
    let resumed = offset > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    let already = if resumed { offset } else { 0 };
    let total_bytes = response.content_length().map(|len| len + already);

    let mut file = if resumed {
        tokio::fs::OpenOptions::new().append(true).open(dest).await
    } else {
        tokio::fs::File::create(dest).await
    }
    .context("No se pudo crear el archivo de destino")?;

    let mut downloaded = already;
    let mut stream = response.bytes_stream();
    let start = Instant::now();
    let mut last_emit = Instant::now();

    while let Some(chunk) = stream.next().await {
        let chunk = match chunk.context("Error leyendo chunk") {
            Ok(chunk) => chunk,
            Err(e) => {
                // Conservar en disco lo recibido para continuar en el siguiente intento
                file.flush().await.ok();
                return Err(e);
            }
        };
        downloaded += chunk.len() as u64;
        file.write_all(&chunk)
            .await
            .context("Error escribiendo en disco")?;

        if let Some(reporter) = reporter {
            if last_emit.elapsed().as_millis() >= 100 {
                let elapsed = start.elapsed().as_secs_f64().max(0.001);
                let speed_bps = ((downloaded - already) as f64 / elapsed) as u64;
                let percent = total_bytes
                    .map(|t| ((downloaded as f64 / t as f64) * 100.0) as u8)
                    .unwrap_or(0);

                progress::emit(
                    reporter,
                    ProgressPayload::Download {
                        step: step_label.to_string(),
                        percent,
                        downloaded_bytes: downloaded,
                        total_bytes,
                        speed_bps,
                    },
                );
                last_emit = Instant::now();
            }
        }
    }

    file.flush()
        .await
        .context("Error al hacer flush del archivo")?;

    // Verificación de tamaño: si el servidor nos dijo cuánto venía y no coincide, es descarga incompleta
    if let Some(expected) = total_bytes {
        if downloaded != expected {
            anyhow::bail!(
                "Descarga incompleta: se esperaban {} bytes, se recibieron {}",
                expected,
                downloaded
            );
        }
    }

    Ok(())
}

pub async fn download_to_temp_with_progress(
    reporter: &Reporter,
    url: &str,
    filename: &str,
    step_label: &str,
) -> Result<std::path::PathBuf> {
    let tmp = std::env::temp_dir().join(format!("kblauncher_{}", filename));
    download_resumable(url, &tmp, Some(reporter), step_label).await?;
    Ok(tmp)
}

/// Descarga varios archivos en paralelo, con reintentos por archivo.
/// Devuelve la lista de archivos que fallaron tras agotar los reintentos.
/// Un `Vec` vacío significa que todo se descargó (o ya existía) correctamente.
pub async fn download_many(
    items: Vec<(String, std::path::PathBuf)>, // (url, dest)
    max_concurrent: usize,
    reporter: Option<&Reporter>,
    label: &str,
) -> Vec<DownloadFailure> {
    const MAX_ATTEMPTS: u32 = 3;

    let semaphore = Arc::new(Semaphore::new(max_concurrent));
    let total = items.len();
    let completed = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let reporter = reporter.cloned();
    let label = label.to_string();

    // JoinSet aborta todas las descargas pendientes si se cancela la instalación
    let mut handles = tokio::task::JoinSet::new();

    for (url, dest) in items {
        let permit = semaphore.clone().acquire_owned().await.unwrap();
        let completed = completed.clone();
        let reporter = reporter.clone();
        let label = label.clone();

        handles.spawn(async move {
            let _permit = permit; // se libera al hacer drop

            // Antes: solo `dest.exists()`. Ahora también comprobamos que no esté vacío/corrupto.
            let already_valid = match tokio::fs::metadata(&dest).await {
                Ok(meta) => meta.len() > 0,
                Err(_) => false,
            };

            if already_valid {
                let done = completed.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                emit_step_progress(&reporter, &label, done, total);
                return None; // sin fallo
            }

            let filename = dest
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            let mut last_err: Option<String> = None;

            for attempt in 1..=MAX_ATTEMPTS {
                match download_to(&url, &dest, None, "").await {
                    Ok(()) => {
                        let done = completed.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                        emit_step_progress(&reporter, &label, done, total);
                        return None; // éxito, sin fallo
                    }
                    Err(e) => {
                        warn!(
                            "[download_many] Intento {}/{} fallido para {}: {}",
                            attempt, MAX_ATTEMPTS, filename, e
                        );
                        last_err = Some(e.to_string());

                        if attempt < MAX_ATTEMPTS {
                            // Backoff simple antes de reintentar
                            tokio::time::sleep(std::time::Duration::from_millis(
                                500 * attempt as u64,
                            ))
                            .await;
                        }
                    }
                }
            }

            error!(
                "[download_many] {} falló tras {} intentos, se abandona",
                filename, MAX_ATTEMPTS
            );

            Some(DownloadFailure {
                url,
                dest,
                error: last_err.unwrap_or_else(|| "Error desconocido".to_string()),
            })
        });
    }

    let mut failures = Vec::new();
    while let Some(result) = handles.join_next().await {
        if let Ok(Some(failure)) = result {
            failures.push(failure);
        }
    }

    failures
}

fn emit_step_progress(reporter: &Option<Reporter>, label: &str, done: usize, total: usize) {
    if let Some(reporter) = reporter {
        if done % 20 == 0 || done == total {
            progress::emit(
                reporter,
                ProgressPayload::Extract {
                    step: format!("{} ({}/{})", label, done, total),
                    percent: (done as f64 / total as f64 * 100.0) as u8,
                    extracted_files: done,
                    total_files: total,
                    speed_fps: 0.0,
                },
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::extract::State;
    use axum::http::{HeaderMap, StatusCode};
    use axum::response::{IntoResponse, Response};
    use axum::routing::get;
    use std::sync::atomic::{AtomicUsize, Ordering};

    const BODY_LEN: usize = 3_000_000;

    fn body() -> Vec<u8> {
        (0..BODY_LEN).map(|i| (i % 251) as u8).collect()
    }

    /// Sirve `BODY_LEN` bytes con soporte de Range; las `fails` primeras
    /// respuestas prometen el archivo entero y cortan la conexión a la mitad.
    async fn flaky(State((calls, fails)): State<(Arc<AtomicUsize>, usize)>, headers: HeaderMap) -> Response {
        let call = calls.fetch_add(1, Ordering::SeqCst);
        let offset: usize = headers
            .get("range")
            .and_then(|r| r.to_str().ok())
            .and_then(|r| r.strip_prefix("bytes=")?.strip_suffix('-')?.parse().ok())
            .unwrap_or(0);
        let data = body()[offset..].to_vec();
        let len = data.len();
        let status = if offset > 0 { StatusCode::PARTIAL_CONTENT } else { StatusCode::OK };
        if call < fails {
            let half = data[..len / 2].to_vec();
            let stream = futures_util::stream::iter(vec![
                Ok::<_, std::io::Error>(axum::body::Bytes::from(half)),
                Err(std::io::Error::other("corte")),
            ]);
            return (status, [("content-length", len.to_string())], axum::body::Body::from_stream(stream)).into_response();
        }
        (status, [("content-length", len.to_string())], data).into_response()
    }

    async fn server(fails: usize) -> (String, Arc<AtomicUsize>) {
        let calls = Arc::new(AtomicUsize::new(0));
        let app = axum::Router::new().route("/f.zip", get(flaky)).with_state((calls.clone(), fails));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await });
        (format!("http://{}/f.zip", addr), calls)
    }

    #[tokio::test]
    async fn resumable_continues_after_connection_drops() {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("f.zip");
        let (url, calls) = server(3).await;
        download_resumable(&url, &dest, None, "").await.unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), body());
        assert_eq!(calls.load(Ordering::SeqCst), 4);
        assert!(!part_path(&dest).exists());
    }

    #[tokio::test]
    async fn resumable_gives_up_and_leaves_destination_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("f.zip");
        std::fs::write(&dest, b"anterior").unwrap();
        let (url, calls) = server(usize::MAX).await;
        assert!(download_resumable(&url, &dest, None, "").await.is_err());
        assert_eq!(std::fs::read(&dest).unwrap(), b"anterior");
        assert_eq!(calls.load(Ordering::SeqCst), RESUMABLE_ATTEMPTS as usize);
        assert!(!part_path(&dest).exists());
    }

    #[tokio::test]
    async fn resumable_does_not_retry_a_404() {
        let dir = tempfile::tempdir().unwrap();
        let (url, _) = server(0).await;
        let missing = url.replace("/f.zip", "/nada.zip");
        let start = Instant::now();
        assert!(download_resumable(&missing, &dir.path().join("x"), None, "").await.is_err());
        assert!(start.elapsed() < Duration::from_secs(1));
    }
}
