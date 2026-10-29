use anyhow::{Context, Result};
use std::path::Path;
use std::time::Instant;
use tokio::io::AsyncWriteExt;
use tauri::AppHandle;
use futures_util::StreamExt;
use std::sync::Arc;
use tokio::sync::Semaphore;
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
    // Se descarga a `.part` y se renombra al final: si la descarga se corta
    // (error o cancelación) no queda un archivo a medias que parezca completo
    let mut part_name = dest.as_os_str().to_owned();
    part_name.push(".part");
    let part = std::path::PathBuf::from(part_name);

    let mut file = tokio::fs::File::create(&part).await
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

    file.flush().await.context("Error escribiendo en disco")?;
    drop(file);
    tokio::fs::rename(&part, dest).await
        .context("No se pudo mover el archivo descargado")?;
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

pub async fn download_many(
    items: Vec<(String, std::path::PathBuf)>, // (url, dest)
    max_concurrent: usize,
    app: Option<&AppHandle>,
    label: &str,
) {
    let semaphore = Arc::new(Semaphore::new(max_concurrent));
    let total = items.len();
    let completed = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let app_clone = app.cloned();
    let label = label.to_string();

    // JoinSet aborta todas las descargas pendientes si se cancela la instalación
    let mut handles = tokio::task::JoinSet::new();

    for (url, dest) in items {
        let permit = semaphore.clone().acquire_owned().await.unwrap();
        let completed = completed.clone();
        let app = app_clone.clone();
        let label = label.clone();

        handles.spawn(async move {
            let _permit = permit; // se libera al hacer drop

            if dest.exists() {
                let done = completed.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                if let Some(ref app) = app {
                    if done % 20 == 0 || done == total {
                        crate::installer::progress::emit(app, crate::installer::progress::ProgressPayload::Extract {
                            step: format!("{} ({}/{})", label, done, total),
                            percent: (done as f64 / total as f64 * 100.0) as u8,
                            extracted_files: done,
                            total_files: total,
                            speed_fps: 0.0,
                        });
                    }
                }
                return;
            }

            if let Some(parent) = dest.parent() {
                tokio::fs::create_dir_all(parent).await.ok();
            }

            let filename = dest.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");

            if let Err(e) = download_to(&url, &dest, None, "").await {
                log::warn!("[download_many] Error descargando {}: {}", filename, e);
                return;
            }

            let done = completed.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
            if let Some(ref app) = app {
                if done % 20 == 0 || done == total {
                    crate::installer::progress::emit(app, crate::installer::progress::ProgressPayload::Extract {
                        step: format!("{} ({}/{})", label, done, total),
                        percent: (done as f64 / total as f64 * 100.0) as u8,
                        extracted_files: done,
                        total_files: total,
                        speed_fps: 0.0,
                    });
                }
            }
        });
    }

    // Esperar a todas
    while handles.join_next().await.is_some() {}
}