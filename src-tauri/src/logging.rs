use tracing_subscriber::filter::LevelFilter;
use tracing_subscriber::prelude::*;

pub fn init_logging() {
    let log_dir = std::path::PathBuf::from("logs");

    std::fs::create_dir_all(&log_dir).ok();

    let output_file = tracing_appender::rolling::never(&log_dir, "output.log");

    let error_file = tracing_appender::rolling::never(&log_dir, "error.log");

    let console_layer = tracing_subscriber::fmt::layer()
        .with_ansi(true)
        .with_filter(LevelFilter::TRACE);

    let output_layer = tracing_subscriber::fmt::layer()
        .with_writer(output_file)
        .with_ansi(false)
        .with_filter(LevelFilter::INFO);

    let error_layer = tracing_subscriber::fmt::layer()
        .with_writer(error_file)
        .with_ansi(false)
        .with_filter(LevelFilter::ERROR);

    tracing_subscriber::registry()
        .with(console_layer)
        .with(output_layer)
        .with(error_layer)
        .init();
}
