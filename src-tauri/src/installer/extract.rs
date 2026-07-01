use anyhow::{Context, Result};
use std::path::Path;
use std::time::Instant;
use tauri::AppHandle;
use crate::installer::progress::{self, ProgressPayload};

pub async fn extract_zip(
    zip_path: &Path,
    dest_dir: &Path,
    overwrite: bool,
    app: Option<&AppHandle>,
    step_label: &str,
) -> Result<()> {
    let zip_path = zip_path.to_owned();
    let dest_dir = dest_dir.to_owned();
    let step_label = step_label.to_string();

    // Capturamos el AppHandle como Option<AppHandle> clonado para pasarlo al thread
    // tauri::AppHandle implementa Clone
    let app_owned = app.cloned();

    tokio::task::spawn_blocking(move || -> Result<()> {
        let file = std::fs::File::open(&zip_path)
            .context("No se pudo abrir el zip")?;
        let mut archive = zip::ZipArchive::new(file)
            .context("Archivo zip inválido")?;

        let total_files = archive.len();
        let start = Instant::now();
        let mut last_emit = Instant::now();

        for i in 0..total_files {
            let mut entry = archive.by_index(i)
                .context("Error leyendo entrada del zip")?;

            let out_path = match entry.enclosed_name() {
                Some(p) => dest_dir.join(p),
                None => continue,
            };

            if entry.is_dir() {
                std::fs::create_dir_all(&out_path)
                    .context("Error creando directorio")?;
            } else {
                if let Some(parent) = out_path.parent() {
                    std::fs::create_dir_all(parent)
                        .context("Error creando directorio padre")?;
                }
                if out_path.exists() && !overwrite {
                    continue;
                }
                let mut out_file = std::fs::File::create(&out_path)
                    .context("Error creando archivo destino")?;
                std::io::copy(&mut entry, &mut out_file)
                    .context("Error copiando archivo del zip")?;
            }

            if let Some(ref app) = app_owned {
                if last_emit.elapsed().as_millis() >= 100 {
                    let elapsed = start.elapsed().as_secs_f64().max(0.001);
                    let speed_fps = (i + 1) as f64 / elapsed;
                    let percent = ((i + 1) as f64 / total_files as f64 * 100.0) as u8;

                    progress::emit(app, ProgressPayload::Extract {
                        step: step_label.clone(),
                        percent,
                        extracted_files: i + 1,
                        total_files,
                        speed_fps,
                    });
                    last_emit = Instant::now();
                }
            }
        }

        // Emit final garantizado
        if let Some(ref app) = app_owned {
            let elapsed = start.elapsed().as_secs_f64().max(0.001);
            progress::emit(app, ProgressPayload::Extract {
                step: step_label,
                percent: 100,
                extracted_files: total_files,
                total_files,
                speed_fps: total_files as f64 / elapsed,
            });
        }

        Ok(())
    })
    .await
    .context("Error en el thread de extracción")??;

    Ok(())
}