use anyhow::{Context, Result};
use std::path::Path;
use tauri::AppHandle;
use crate::installer::progress::{emit, ProgressPayload};
use crate::installer::download;

pub async fn install(
    app: &AppHandle,
    versions_dir: &Path,
    instance_dir: &Path,
    mc_version: &str,
    neoforge_version: &str,
) -> Result<()> {
    emit(app, ProgressPayload::Step { step: "Descargando instalador de NeoForge...".into(), percent: 10 });

    let installer_url = format!(
        "https://maven.neoforged.net/releases/net/neoforged/neoforge/{v}/neoforge-{v}-installer.jar",
        v = neoforge_version,
    );

    let installer_path = download::download_to_temp(&installer_url, "neoforge-installer.jar").await
        .context("Error descargando NeoForge installer")?;

    emit(app, ProgressPayload::Step { step: "Ejecutando instalador de NeoForge...".into(), percent: 30 });

    let status = tokio::process::Command::new("java")
        .args([
            "-jar",
            installer_path.to_str().unwrap(),
            "--installClient",
            versions_dir.parent().unwrap().to_str().unwrap(),
        ])
        .status()
        .await
        .context("No se pudo ejecutar Java. ¿Está instalado?")?;

    tokio::fs::remove_file(&installer_path).await.ok();

    if !status.success() {
        anyhow::bail!("El instalador de NeoForge falló con código {:?}", status.code());
    }

    emit(app, ProgressPayload::Step { step: "NeoForge instalado".into(), percent: 55 });
    Ok(())
}