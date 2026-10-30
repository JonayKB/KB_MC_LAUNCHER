use crate::installer::progress::{self, ProgressPayload, Reporter};
use anyhow::{Context, Result};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Tareas en hilos bloqueantes que siguen tocando disco. Abortar una tarea de
/// tokio no detiene su hilo: la limpieza tras cancelar debe esperar a estas.
static ACTIVE_BLOCKING: AtomicUsize = AtomicUsize::new(0);

struct ActiveGuard;

impl ActiveGuard {
    fn new() -> Self {
        ACTIVE_BLOCKING.fetch_add(1, Ordering::SeqCst);
        Self
    }
}

impl Drop for ActiveGuard {
    fn drop(&mut self) {
        ACTIVE_BLOCKING.fetch_sub(1, Ordering::SeqCst);
    }
}

/// Avisa al hilo de extracción si se abandona (se cancela) la tarea que lo esperaba
struct StopOnDrop(Arc<AtomicBool>);

impl Drop for StopOnDrop {
    fn drop(&mut self) {
        self.0.store(true, Ordering::SeqCst);
    }
}

/// Espera a que terminen los hilos bloqueantes en curso
pub async fn wait_idle() {
    let deadline = Instant::now() + Duration::from_secs(30);
    while ACTIVE_BLOCKING.load(Ordering::SeqCst) > 0 && Instant::now() < deadline {
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

/// Ejecuta trabajo de disco que debe llegar hasta el final aunque se cancele
/// la instalación, para no dejarlo a medias.
pub async fn run_uninterrupted<F>(work: F) -> Result<()>
where
    F: FnOnce() -> Result<()> + Send + 'static,
{
    let guard = ActiveGuard::new();
    tokio::task::spawn_blocking(move || {
        let _guard = guard;
        work()
    })
    .await
    .context("Error en el hilo de disco")?
}

pub async fn extract_zip(
    zip_path: &Path,
    dest_dir: &Path,
    overwrite: bool,
    reporter: Option<&Reporter>,
    step_label: &str,
) -> Result<()> {
    let zip_path = zip_path.to_owned();
    let dest_dir = dest_dir.to_owned();
    let step_label = step_label.to_string();
    let reporter = reporter.cloned();

    let stop = Arc::new(AtomicBool::new(false));
    let _stop_on_drop = StopOnDrop(stop.clone());
    let guard = ActiveGuard::new();

    tokio::task::spawn_blocking(move || -> Result<()> {
        let _guard = guard;
        let file = std::fs::File::open(&zip_path).context("No se pudo abrir el zip")?;
        let mut archive = zip::ZipArchive::new(file).context("Archivo zip inválido")?;

        let total_files = archive.len();
        let start = Instant::now();
        let mut last_emit = Instant::now();

        for i in 0..total_files {
            if stop.load(Ordering::SeqCst) {
                anyhow::bail!("Extracción cancelada");
            }
            let mut entry = archive.by_index(i).context("Error leyendo entrada del zip")?;

            let out_path = match entry.enclosed_name() {
                Some(p) => dest_dir.join(p),
                None => continue,
            };

            if entry.is_dir() {
                std::fs::create_dir_all(&out_path).context("Error creando directorio")?;
            } else {
                if let Some(parent) = out_path.parent() {
                    std::fs::create_dir_all(parent).context("Error creando directorio padre")?;
                }
                if out_path.exists() && !overwrite {
                    continue;
                }
                let mut out_file =
                    std::fs::File::create(&out_path).context("Error creando archivo destino")?;
                copy_until_stopped(&mut entry, &mut out_file, &stop)?;
            }

            if let Some(ref reporter) = reporter {
                if last_emit.elapsed().as_millis() >= 100 {
                    let elapsed = start.elapsed().as_secs_f64().max(0.001);
                    let speed_fps = (i + 1) as f64 / elapsed;
                    let percent = ((i + 1) as f64 / total_files as f64 * 100.0) as u8;

                    progress::emit(reporter, ProgressPayload::Extract {
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
        if let Some(ref reporter) = reporter {
            let elapsed = start.elapsed().as_secs_f64().max(0.001);
            progress::emit(reporter, ProgressPayload::Extract {
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

/// Copia por bloques para poder cortar también en mitad de un archivo grande
fn copy_until_stopped(reader: &mut impl Read, writer: &mut impl Write, stop: &AtomicBool) -> Result<()> {
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        if stop.load(Ordering::SeqCst) {
            anyhow::bail!("Extracción cancelada");
        }
        let read = reader.read(&mut buf).context("Error copiando archivo del zip")?;
        if read == 0 {
            return Ok(());
        }
        writer.write_all(&buf[..read]).context("Error copiando archivo del zip")?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_zip(path: &Path, files: usize, size: usize) {
        let mut zip = zip::ZipWriter::new(std::fs::File::create(path).unwrap());
        let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for i in 0..files {
            zip.start_file(format!("f{}.bin", i), options).unwrap();
            zip.write_all(&vec![7u8; size]).unwrap();
        }
        zip.finish().unwrap();
    }

    #[tokio::test]
    async fn extracts_every_file() {
        let dir = tempfile::tempdir().unwrap();
        let zip = dir.path().join("a.zip");
        make_zip(&zip, 5, 10);
        let out = dir.path().join("out");
        extract_zip(&zip, &out, true, None, "").await.unwrap();
        assert_eq!(std::fs::read_dir(&out).unwrap().count(), 5);
    }

    #[tokio::test]
    async fn abandoned_extraction_stops_and_is_waited_for() {
        let dir = tempfile::tempdir().unwrap();
        let zip = dir.path().join("a.zip");
        make_zip(&zip, 2000, 256 * 1024);
        let out = dir.path().join("out");

        let (zip2, out2) = (zip.clone(), out.clone());
        let task = tokio::spawn(async move { extract_zip(&zip2, &out2, true, None, "").await });
        while !out.exists() {
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
        task.abort();
        let _ = task.await;
        wait_idle().await;

        let extracted = std::fs::read_dir(&out).unwrap().count();
        assert!(extracted < 2000, "siguió extrayendo tras cancelar: {}", extracted);
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(std::fs::read_dir(&out).unwrap().count(), extracted);
    }
}
