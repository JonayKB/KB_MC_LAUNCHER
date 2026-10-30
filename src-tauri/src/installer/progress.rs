use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ProgressPayload {
    Step {
        step: String,
        percent: u8,
    },
    Download {
        step: String,
        percent: u8,
        downloaded_bytes: u64,
        total_bytes: Option<u64>,
        speed_bps: u64,
    },
    Extract {
        step: String,
        percent: u8,
        extracted_files: usize,
        total_files: usize,
        speed_fps: f64,
    },
}

/// Fase actual de la instalación: el `percent` de cada evento (0-100 dentro de
/// su paso) se reescala a `[start, end]` para tener una barra global.
/// Solo hay una instalación a la vez, así que basta con un estado global.
struct Phase {
    index: u8,
    count: u8,
    /// Tramo del paso completo
    step_start: f64,
    step_end: f64,
    /// Tramo actual dentro del paso (ver `sub_range`)
    start: f64,
    end: f64,
    /// La barra nunca retrocede (los loaders reinician su % en cada sub-paso)
    last: f64,
}

static PHASE: Mutex<Phase> = Mutex::new(Phase { index: 0, count: 0, step_start: 0.0, step_end: 100.0, start: 0.0, end: 100.0, last: 0.0 });

/// Al empezar una instalación: barra a 0 y sin paso (los eventos pasan tal cual)
pub fn reset() {
    *PHASE.lock().unwrap() = Phase { index: 0, count: 0, step_start: 0.0, step_end: 100.0, start: 0.0, end: 100.0, last: 0.0 };
}

/// Entra en el paso `index` de `count` (empezando en 1), que ocupa `[start, end]` de la barra.
/// Varias llamadas con el mismo `index` dividen ese paso en tramos.
pub fn set_phase(index: u8, count: u8, start: u8, end: u8) {
    let mut phase = PHASE.lock().unwrap();
    let (start, end) = (start as f64, end as f64);
    let last = phase.last.max(start);
    *phase = Phase { index, count, step_start: start, step_end: end, start, end, last };
}

/// Dentro del paso actual, los siguientes eventos ocupan del `from`% al `to`% del paso.
/// Lo usan los loaders, que encadenan varias descargas con su propio 0-100.
pub fn sub_range(from: u8, to: u8) {
    let mut phase = PHASE.lock().unwrap();
    let span = phase.step_end - phase.step_start;
    phase.start = phase.step_start + span * from as f64 / 100.0;
    phase.end = phase.step_start + span * to as f64 / 100.0;
    phase.last = phase.last.max(phase.start);
}

/// Destino de los eventos de progreso. Sin ventana (`none`) el instalador
/// funciona igual, sin notificar a nadie.
#[derive(Clone)]
pub struct Reporter(Option<AppHandle>);

impl Reporter {
    pub fn new(app: AppHandle) -> Self {
        Self(Some(app))
    }

    pub fn none() -> Self {
        Self(None)
    }
}

pub fn emit(reporter: &Reporter, payload: ProgressPayload) {
    let Some(app) = &reporter.0 else { return };
    let Ok(mut value) = serde_json::to_value(&payload) else { return };
    let local = value["percent"].as_f64().unwrap_or(0.0).clamp(0.0, 100.0);
    let (global, index, count) = {
        let mut phase = PHASE.lock().unwrap();
        if phase.count == 0 {
            // Fuera de una instalación por pasos: el % del evento es el global
            phase.last = local;
        }
        let mapped = phase.start + (phase.end - phase.start) * local / 100.0;
        phase.last = phase.last.max(mapped);
        (phase.last, phase.index, phase.count)
    };
    value["percent"] = serde_json::json!(global.round() as u8);
    value["step_index"] = serde_json::json!(index);
    value["step_count"] = serde_json::json!(count);
    let _ = app.emit("install_progress", value);
}