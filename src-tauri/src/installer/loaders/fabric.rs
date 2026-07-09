use anyhow::{Context, Result};
use std::path::Path;
use tauri::AppHandle;
use crate::installer::progress::{emit, ProgressPayload};
use crate::installer::download;

pub async fn install(
    app: &AppHandle,
    versions_dir: &Path,
    _instance_dir: &Path,
    mc_version: &str,
    fabric_version: &str,
) -> Result<()> {
    emit(app, ProgressPayload::Step { step: "Descargando Fabric installer...".into(), percent: 10 });

    let installer_url = format!(
        "https://maven.fabricmc.net/net/fabricmc/fabric-installer/{v}/fabric-installer-{v}.jar",
        v = fabric_version,
    );

    let installer_path = download::download_to_temp(&installer_url, "fabric-installer.jar").await
        .context("Error descargando Fabric installer")?;

    emit(app, ProgressPayload::Step { step: "Ejecutando instalador de Fabric...".into(), percent: 30 });

    let status = tokio::process::Command::new("java")
        .args([
            "-jar",
            installer_path.to_str().unwrap(),
            "client",
            "-dir", versions_dir.parent().unwrap().to_str().unwrap(),
            "-mcversion", mc_version,
            "-loader", fabric_version,
            "-noprofile",
        ])
        .status()
        .await
        .context("No se pudo ejecutar Java. ¿Está instalado?")?;

    tokio::fs::remove_file(&installer_path).await.ok();

    if !status.success() {
        anyhow::bail!("El instalador de Fabric falló con código {:?}", status.code());
    }

    emit(app, ProgressPayload::Step { step: "Fabric instalado".into(), percent: 55 });
    Ok(())
}