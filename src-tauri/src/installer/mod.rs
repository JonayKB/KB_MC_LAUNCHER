pub mod download;
pub mod extract;
pub mod loaders;
pub mod progress;
pub mod requirements;
pub mod sysinfo;

use crate::installer::sysinfo::{get_system_info, recommend_settings, RecommendedSettings};
use anyhow::{Context, Result};
use progress::emit;
pub use progress::ProgressPayload;
use std::path::Path;
use tauri::AppHandle;

pub async fn install(
    app: AppHandle,
    base_path: String,
    mc_version: String,
    loader: String,
    loader_version: Option<String>,
    overrides_url: String,
    mods_url: String,
    modpack_id: String,
    modpack_version: Option<String>,
) -> Result<()> {
    let base = Path::new(&base_path);
    let versions_dir = base.join("versions");
    let instance_dir = base.join("instances").join(&modpack_id);
    let mods_dir = instance_dir.join("mods");

    tokio::fs::create_dir_all(&versions_dir).await?;
    tokio::fs::create_dir_all(&mods_dir).await?;

    emit(
        &app,
        ProgressPayload::Step {
            step: "Instalando loader...".into(),
            percent: 5,
        },
    );
    match loader.as_str() {
        "forge" => {
            let ver = loader_version.context("Forge requiere loader_version")?;
            loaders::forge::install(&app, &versions_dir, &instance_dir, &mc_version, &ver).await?;
        }
        "neoforge" => {
            let ver = loader_version.context("NeoForge requiere loader_version")?;
            loaders::neoforge::install(&app, &versions_dir, &instance_dir, &mc_version, &ver)
                .await?;
        }
        "fabric" => {
            let ver = loader_version.context("Fabric requiere loader_version")?;
            loaders::fabric::install(&app, &versions_dir, &instance_dir, &mc_version, &ver).await?;
        }
        _ => {
            loaders::vanilla::install(&app, &versions_dir, &instance_dir, &mc_version).await?;
        }
    }

    let mods_zip = std::env::temp_dir().join("kblauncher_mods.zip");
    download::download_to(&mods_url, &mods_zip, Some(&app), "Descargando mods...").await?;
    extract::extract_zip(&mods_zip, &mods_dir, true, Some(&app), "Extrayendo mods...").await?;
    tokio::fs::remove_file(&mods_zip).await.ok();

    let overrides_zip = std::env::temp_dir().join("kblauncher_overrides.zip");
    download::download_to(
        &overrides_url,
        &overrides_zip,
        Some(&app),
        "Descargando overrides...",
    )
    .await?;
    extract::extract_zip(
        &overrides_zip,
        &instance_dir,
        true,
        Some(&app),
        "Aplicando overrides...",
    )
    .await?;
    tokio::fs::remove_file(&overrides_zip).await.ok();

    let installed_version_content = modpack_version.as_deref().unwrap_or("???");
    tokio::fs::write(
        instance_dir.join("installed_version"),
        installed_version_content,
    )
    .await?;

    emit(
        &app,
        ProgressPayload::Step {
            step: "Instalación completada".into(),
            percent: 100,
        },
    );
    Ok(())
}

pub async fn update(
    app: AppHandle,
    base_path: String,
    overrides_url: String,
    mods_url: String,
    modpack_id: String,
    modpack_version: Option<String>,
) -> Result<()> {
    let base = Path::new(&base_path);
    let instance_dir = base.join("instances").join(&modpack_id);
    let mods_dir = instance_dir.join("mods");

    if !instance_dir.exists() || !mods_dir.exists() {
        return Err(anyhow::anyhow!("El modpack no está instalado"));
    }

    tokio::fs::remove_dir_all(&mods_dir).await?;
    tokio::fs::create_dir_all(&mods_dir).await?;

    let mods_zip = std::env::temp_dir().join("kblauncher_mods.zip");
    download::download_to(&mods_url, &mods_zip, Some(&app), "Descargando mods...").await?;
    extract::extract_zip(&mods_zip, &mods_dir, true, Some(&app), "Extrayendo mods...").await?;
    tokio::fs::remove_file(&mods_zip).await.ok();

    let overrides_zip = std::env::temp_dir().join("kblauncher_overrides.zip");
    download::download_to(
        &overrides_url,
        &overrides_zip,
        Some(&app),
        "Descargando overrides...",
    )
    .await?;
    extract::extract_zip(
        &overrides_zip,
        &instance_dir,
        true,
        Some(&app),
        "Aplicando overrides...",
    )
    .await?;
    tokio::fs::remove_file(&overrides_zip).await.ok();

    let installed_version_content = modpack_version.as_deref().unwrap_or("???");
    tokio::fs::write(
        instance_dir.join("installed_version"),
        installed_version_content,
    )
    .await?;

    emit(
        &app,
        ProgressPayload::Step {
            step: "Actualización completada".into(),
            percent: 100,
        },
    );
    Ok(())
}
