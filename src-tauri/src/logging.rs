use tauri::{AppHandle, Manager};
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::filter::LevelFilter;
use tracing_subscriber::prelude::*;

/// Días de logs que se conservan
const MAX_LOG_FILES: usize = 7;

/// Un archivo por día; los de hace más de `MAX_LOG_FILES` días se borran solos
fn daily_appender(dir: &std::path::Path, prefix: &str) -> Option<RollingFileAppender> {
    RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix(prefix)
        .filename_suffix("log")
        .max_log_files(MAX_LOG_FILES)
        .build(dir)
        .ok()
}

pub fn init_logging(app: &AppHandle) {
    let log_dir = app.path().app_data_dir().unwrap().join("logs");

    std::fs::create_dir_all(&log_dir).ok();
    // Las versiones anteriores escribían siempre en estos, sin límite de tamaño
    for legacy in ["output.log", "error.log"] {
        std::fs::remove_file(log_dir.join(legacy)).ok();
    }

    let console_layer = tracing_subscriber::fmt::layer()
        .with_ansi(true)
        .with_filter(LevelFilter::TRACE);

    let output_layer = daily_appender(&log_dir, "output").map(|writer| {
        tracing_subscriber::fmt::layer()
            .with_writer(writer)
            .with_ansi(false)
            .with_filter(LevelFilter::INFO)
    });

    let error_layer = daily_appender(&log_dir, "error").map(|writer| {
        tracing_subscriber::fmt::layer()
            .with_writer(writer)
            .with_ansi(false)
            .with_filter(LevelFilter::ERROR)
    });

    tracing_subscriber::registry()
        .with(console_layer)
        .with(output_layer)
        .with(error_layer)
        .init();
}
