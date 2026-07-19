use anyhow::{Context, Result};
use futures_util::StreamExt;
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;
use tauri::AppHandle;
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;
use tracing::warn;

use crate::installer::{ProgressPayload, progress};

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
    // Escribir a un archivo temporal junto al destino final, no al destino directamente
    let tmp_dest = dest.with_extension(
        format!("{}.part", dest.extension().and_then(|e| e.to_str()).unwrap_or("tmp")),
    );

    let result = download_to_inner(url, &tmp_dest, app, step_label).await;

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

async fn download_to_inner(
    url: &str,
    dest: &Path,
    app: Option<&AppHandle>,
    step_label: &str,
) -> Result<()> {
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await.ok();
    }

    // Petición HTTP PRIMERO, archivo se crea DESPUÉS de confirmar respuesta OK
    let response = reqwest::get(url)
        .await
        .context("Error en la petición HTTP")?
        .error_for_status()
        .context("El servidor devolvió un error")?;

    let total_bytes = response.content_length();
    let mut file = tokio::fs::File::create(dest)
        .await
        .context("No se pudo crear el archivo de destino")?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let start = Instant::now();
    let mut last_emit = Instant::now();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.context("Error leyendo chunk")?;
        downloaded += chunk.len() as u64;
        file.write_all(&chunk)
            .await
            .context("Error escribiendo en disco")?;

        if let Some(app) = app {
            if last_emit.elapsed().as_millis() >= 100 {
                let elapsed = start.elapsed().as_secs_f64().max(0.001);
                let speed_bps = (downloaded as f64 / elapsed) as u64;
                let percent = total_bytes
                    .map(|t| ((downloaded as f64 / t as f64) * 100.0) as u8)
                    .unwrap_or(0);

                progress::emit(
                    app,
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

    file.flush().await.context("Error al hacer flush del archivo")?;

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
    items: Vec<(String, std::path::PathBuf)>, // (url, dest, [opcional: tamaño esperado])
    max_concurrent: usize,
    app: Option<&AppHandle>,
    label: &str,
) {
    let semaphore = Arc::new(Semaphore::new(max_concurrent));
    let total = items.len();
    let completed = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let app_clone = app.cloned();
    let label = label.to_string();

    let mut handles = Vec::new();

    for (url, dest) in items {
        let permit = semaphore.clone().acquire_owned().await.unwrap();
        let completed = completed.clone();
        let app = app_clone.clone();
        let label = label.clone();

        let handle = tokio::spawn(async move {
            let _permit = permit;

            // Antes: solo `dest.exists()`. Ahora también comprobamos que no esté vacío/corrupto.
            let already_valid = match tokio::fs::metadata(&dest).await {
                Ok(meta) => meta.len() > 0,
                Err(_) => false,
            };

            if already_valid {
                let done = completed.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                if let Some(ref app) = app {
                    if done % 20 == 0 || done == total {
                        crate::installer::progress::emit(
                            app,
                            crate::installer::progress::ProgressPayload::Extract {
                                step: format!("{} ({}/{})", label, done, total),
                                percent: (done as f64 / total as f64 * 100.0) as u8,
                                extracted_files: done,
                                total_files: total,
                                speed_fps: 0.0,
                            },
                        );
                    }
                }
                return;
            }

            let filename = dest.file_name().and_then(|n| n.to_str()).unwrap_or("");

            if let Err(e) = download_to(&url, &dest, None, "").await {
                warn!("[download_many] Error descargando {}: {}", filename, e);
                return;
            }

            let done = completed.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
            if let Some(ref app) = app {
                if done % 20 == 0 || done == total {
                    crate::installer::progress::emit(
                        app,
                        crate::installer::progress::ProgressPayload::Extract {
                            step: format!("{} ({}/{})", label, done, total),
                            percent: (done as f64 / total as f64 * 100.0) as u8,
                            extracted_files: done,
                            total_files: total,
                            speed_fps: 0.0,
                        },
                    );
                }
            }
        });

        handles.push(handle);
    }

    for handle in handles {
        handle.await.ok();
    }
}