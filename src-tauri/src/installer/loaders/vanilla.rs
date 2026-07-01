use anyhow::{Context, Result};
use std::path::Path;
use tauri::AppHandle;
use crate::installer::progress::{emit, ProgressPayload};
use crate::installer::download;

const VERSION_MANIFEST: &str =
    "https://launchermeta.mojang.com/mc/game/version_manifest.json";

pub async fn install(
    app: &AppHandle,
    versions_dir: &Path,
    instance_dir: &Path,
    mc_version: &str,
) -> Result<()> {
    emit(app, ProgressPayload::Step { step: "Obteniendo manifest de versiones...".into(), percent: 10 });

    let manifest: serde_json::Value = reqwest::get(VERSION_MANIFEST).await?
        .json().await.context("Error parseando manifest")?;

    let version_url = manifest["versions"]
        .as_array().context("versions no es array")?
        .iter()
        .find(|v| v["id"].as_str() == Some(mc_version))
        .context(format!("Versión {} no encontrada", mc_version))?["url"]
        .as_str().context("url inválida")?.to_string();

    emit(app, ProgressPayload::Step { step: "Descargando version JSON...".into(), percent: 20 });

    let version_json: serde_json::Value = reqwest::get(&version_url).await?
        .json().await.context("Error parseando version JSON")?;

    let version_dir = versions_dir.join(mc_version);
    tokio::fs::create_dir_all(&version_dir).await?;
    let json_path = version_dir.join(format!("{}.json", mc_version));
    tokio::fs::write(&json_path, serde_json::to_string_pretty(&version_json)?).await?;

    let client_url = version_json["downloads"]["client"]["url"]
        .as_str().context("URL del cliente no encontrada")?;

    emit(app, ProgressPayload::Step { step: "Descargando Minecraft...".into(), percent: 30 });

    let jar_path = version_dir.join(format!("{}.jar", mc_version));
    download::download_to(client_url, &jar_path, Some(app), "Descargando Minecraft...").await?;

    let instance_version_dir = instance_dir.join("versions").join(mc_version);
    tokio::fs::create_dir_all(&instance_version_dir).await?;
    tokio::fs::copy(&jar_path, instance_version_dir.join(format!("{}.jar", mc_version))).await?;
    tokio::fs::copy(&json_path, instance_version_dir.join(format!("{}.json", mc_version))).await?;

    Ok(())
}