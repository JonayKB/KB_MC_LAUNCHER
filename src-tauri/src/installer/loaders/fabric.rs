use anyhow::{Context, Result};
use std::path::Path;
use tauri::AppHandle;
use crate::installer::loaders::vanilla;
use crate::installer::progress::{self, emit, ProgressPayload};

const FABRIC_META: &str = "https://meta.fabricmc.net/v2/versions/loader";

/// Id de versión que genera Fabric, p.ej. `fabric-loader-0.16.10-1.20.1`
pub fn version_id(mc_version: &str, loader_version: &str) -> String {
    format!("fabric-loader-{}-{}", loader_version, mc_version)
}

/// Instala Fabric sin ejecutar su instalador: se descarga el perfil de
/// meta.fabricmc.net (que hereda de vanilla) y sus libraries Maven.
pub async fn install(
    app: &AppHandle,
    versions_dir: &Path,
    _instance_dir: &Path,
    mc_version: &str,
    loader_version: &str,
) -> Result<()> {
    let launcher_root = versions_dir
        .parent()
        .context("No se pudo determinar la raíz del launcher")?;

    vanilla::prepare(app, versions_dir, mc_version).await?;

    emit(app, ProgressPayload::Step { step: "Descargando perfil de Fabric...".into(), percent: 60 });

    let profile_url = format!("{}/{}/{}/profile/json", FABRIC_META, mc_version, loader_version);
    let profile_str = reqwest::get(&profile_url).await
        .context("Error contactando con meta.fabricmc.net")?
        .error_for_status()
        .context(format!("Fabric {} no existe para Minecraft {}", loader_version, mc_version))?
        .text().await?;
    let profile: serde_json::Value =
        serde_json::from_str(&profile_str).context("Perfil de Fabric inválido")?;

    let id = version_id(mc_version, loader_version);
    let version_dir = versions_dir.join(&id);
    tokio::fs::create_dir_all(&version_dir).await?;
    tokio::fs::write(version_dir.join(format!("{}.json", id)), &profile_str).await?;

    progress::sub_range(90, 100);
    vanilla::download_maven_libraries(&profile, launcher_root, app, "Libraries Fabric").await?;

    emit(app, ProgressPayload::Step { step: "Fabric instalado".into(), percent: 100 });
    tracing::info!("[fabric::install] ✓ {} instalado", id);
    Ok(())
}
