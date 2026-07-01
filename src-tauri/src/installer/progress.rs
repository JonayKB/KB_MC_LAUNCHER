use serde::Serialize;
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

pub fn emit(app: &AppHandle, payload: ProgressPayload) {
    let _ = app.emit("install_progress", payload);
}