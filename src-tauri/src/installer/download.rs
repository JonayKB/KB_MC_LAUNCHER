use anyhow::{Context, Result};
use std::path::Path;
use std::time::Instant;
use tokio::io::AsyncWriteExt;
use tauri::AppHandle;
use futures_util::StreamExt;
use crate::installer::progress::{self, ProgressPayload};

pub async fn download_to_temp(url: &str, filename: &str) -> Result<std::path::PathBuf> {
    let tmp = std::env::temp_dir().join(format!("kblauncher_{}", filename));
    download_to(url, &tmp, None, "").await?;
    Ok(tmp)
}

pub async fn download_to(
    url: &str,
    dest: &Path,
    app: Option<&AppHandle>,
    step_label: &str,
) -> Result<()> {
    let mut file = tokio::fs::File::create(dest).await
        .context("No se pudo crear el archivo de destino")?;

    let response = reqwest::get(url).await
        .context("Error en la petición HTTP")?
        .error_for_status()
        .context("El servidor devolvió un error")?;

    let total_bytes = response.content_length();
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let start = Instant::now();
    let mut last_emit = Instant::now();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.context("Error leyendo chunk")?;
        downloaded += chunk.len() as u64;
        file.write_all(&chunk).await.context("Error escribiendo en disco")?;

        if let Some(app) = app {
            if last_emit.elapsed().as_millis() >= 100 {
                let elapsed = start.elapsed().as_secs_f64().max(0.001);
                let speed_bps = (downloaded as f64 / elapsed) as u64;
                let percent = total_bytes
                    .map(|t| ((downloaded as f64 / t as f64) * 100.0) as u8)
                    .unwrap_or(0);

                progress::emit(app, ProgressPayload::Download {
                    step: step_label.to_string(),
                    percent,
                    downloaded_bytes: downloaded,
                    total_bytes,
                    speed_bps,
                });
                last_emit = Instant::now();
            }
        }
    }

    Ok(())
}

pub async fn download_to_temp_with_progress(
    app: &AppHandle,
    url: &str,
    filename: &str,
    step_label: &str,
    _base_percent: u8,
) -> Result<std::path::PathBuf> {
    let tmp = std::env::temp_dir().join(format!("kblauncher_{}", filename));
    download_to(url, &tmp, Some(app), step_label).await?;
    Ok(tmp)
}