use crate::installer::download;
use crate::installer::progress::{emit, ProgressPayload};
use crate::installer::requirements::{
    check_java_by_minecraft_version, install_java_by_minecraft_version,
};
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const VERSION_MANIFEST: &str =
    "https://launchermeta.mojang.com/mc/game/version_manifest.json";

pub async fn install(
    app: &AppHandle,
    versions_dir: &Path,
    _instance_dir: &Path,
    mc_version: &str,
) -> Result<()> {
    prepare(app, versions_dir, mc_version).await?;
    emit(app, ProgressPayload::Step { step: "Minecraft instalado".into(), percent: 100 });
    Ok(())
}

/// Deja listo Minecraft vanilla: Java, JSON, jar, libraries y assets.
/// Lo usan los loaders que no traen su propio instalador (Fabric, vanilla).
pub async fn prepare(app: &AppHandle, versions_dir: &Path, mc_version: &str) -> Result<serde_json::Value> {
    let launcher_root = versions_dir
        .parent()
        .context("No se pudo determinar la raíz del launcher")?;

    // ── Java ──────────────────────────────────────────────────
    emit(app, ProgressPayload::Step { step: "Comprobando Java...".into(), percent: 5 });
    if !check_java_by_minecraft_version(mc_version, launcher_root).await {
        install_java_by_minecraft_version(mc_version, launcher_root).await?;
    }

    // ── JSON de la versión ────────────────────────────────────
    let version_dir = versions_dir.join(mc_version);
    tokio::fs::create_dir_all(&version_dir).await?;
    let json_path = version_dir.join(format!("{}.json", mc_version));
    let jar_path = version_dir.join(format!("{}.jar", mc_version));

    if !json_path.exists() {
        emit(app, ProgressPayload::Step { step: "Obteniendo manifest de Mojang...".into(), percent: 8 });

        let manifest: serde_json::Value = reqwest::get(VERSION_MANIFEST).await?
            .json().await.context("Error parseando manifest")?;

        let version_url = manifest["versions"]
            .as_array().context("versions no es array")?
            .iter()
            .find(|v| v["id"].as_str() == Some(mc_version))
            .context(format!("Versión {} no encontrada", mc_version))?["url"]
            .as_str().context("url inválida")?.to_string();

        let version_json = reqwest::get(&version_url).await?
            .error_for_status()?
            .text().await.context("Error descargando version JSON")?;
        tokio::fs::write(&json_path, version_json).await?;
    }

    let mc_json: serde_json::Value = serde_json::from_str(
        &tokio::fs::read_to_string(&json_path).await?,
    ).context("JSON de Minecraft inválido")?;

    // ── Jar del cliente ───────────────────────────────────────
    if !jar_path.exists() {
        let client_url = mc_json["downloads"]["client"]["url"]
            .as_str().context("URL del cliente no encontrada")?;
        download::download_to(
            client_url, &jar_path, Some(app),
            &format!("Descargando Minecraft {}...", mc_version),
        ).await?;
    }

    download_libraries(&mc_json, launcher_root, app, "Libraries Minecraft").await;
    download_assets(&mc_json, launcher_root, app).await;

    Ok(mc_json)
}

// ── Helpers compartidos con los loaders ───────────────────────

/// Descarga las libraries que traen `downloads.artifact` (formato Mojang/Forge)
pub async fn download_libraries(
    json: &serde_json::Value,
    launcher_root: &Path,
    app: &AppHandle,
    label: &str,
) {
    let libs_dir = launcher_root.join("libraries");

    let items: Vec<(String, PathBuf)> = json["libraries"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|lib| {
            let url  = lib["downloads"]["artifact"]["url"].as_str()?;
            let path = lib["downloads"]["artifact"]["path"].as_str()?;
            if url.is_empty() { return None; }
            Some((url.to_string(), libs_dir.join(path)))
        }).collect())
        .unwrap_or_default();

    log::info!("[download_libraries] {} — {} items en paralelo", label, items.len());
    download::download_many(items, 16, Some(app), label).await;
}

/// Descarga libraries en formato Maven (`name` + `url` base), como las de Fabric
pub async fn download_maven_libraries(
    json: &serde_json::Value,
    launcher_root: &Path,
    app: &AppHandle,
    label: &str,
) {
    let libs_dir = launcher_root.join("libraries");

    let items: Vec<(String, PathBuf)> = json["libraries"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|lib| {
            let name = lib["name"].as_str()?;
            let base = lib["url"].as_str().unwrap_or("https://libraries.minecraft.net/");
            let rel = maven_relative_path(name)?;
            let url = format!("{}/{}", base.trim_end_matches('/'), rel);
            Some((url, libs_dir.join(rel)))
        }).collect())
        .unwrap_or_default();

    log::info!("[download_maven_libraries] {} — {} items en paralelo", label, items.len());
    download::download_many(items, 16, Some(app), label).await;
}

/// `grupo:artefacto:versión[:clasificador]` → `grupo/artefacto/versión/artefacto-versión[-clasificador].jar`
pub fn maven_relative_path(name: &str) -> Option<String> {
    let parts: Vec<&str> = name.splitn(4, ':').collect();
    if parts.len() < 3 {
        return None;
    }
    let (group, artifact, version) = (parts[0].replace('.', "/"), parts[1], parts[2]);
    let classifier = parts.get(3).map(|c| format!("-{}", c)).unwrap_or_default();
    Some(format!("{group}/{artifact}/{version}/{artifact}-{version}{classifier}.jar"))
}

pub async fn download_assets(mc_json: &serde_json::Value, launcher_root: &Path, app: &AppHandle) {
    let asset_index_url = mc_json["assetIndex"]["url"].as_str();
    let asset_id        = mc_json["assetIndex"]["id"].as_str();
    let (Some(index_url), Some(id)) = (asset_index_url, asset_id) else { return };

    let indexes_dir = launcher_root.join("assets").join("indexes");
    tokio::fs::create_dir_all(&indexes_dir).await.ok();
    let index_path = indexes_dir.join(format!("{}.json", id));

    if !index_path.exists() {
        emit(app, ProgressPayload::Step {
            step: "Descargando índice de assets...".into(), percent: 0,
        });
        download::download_to(index_url, &index_path, None, "").await.ok();
    }

    let Ok(index_str)  = tokio::fs::read_to_string(&index_path).await else { return };
    let Ok(index_json) = serde_json::from_str::<serde_json::Value>(&index_str) else { return };
    let Some(objects)  = index_json["objects"].as_object() else { return };

    let objects_dir = launcher_root.join("assets").join("objects");

    let items: Vec<(String, PathBuf)> = objects.values()
        .filter_map(|obj| obj["hash"].as_str())
        .map(|hash| {
            let prefix = &hash[..2];
            let dest   = objects_dir.join(prefix).join(hash);
            let url    = format!(
                "https://resources.download.minecraft.net/{}/{}",
                prefix, hash
            );
            (url, dest)
        })
        .collect();

    let total = items.len();
    let already = items.iter().filter(|(_, d)| d.exists()).count();
    let pending = total - already;

    log::info!("[download_assets] {} assets totales — {} ya descargados — {} pendientes", total, already, pending);

    if pending == 0 {
        emit(app, ProgressPayload::Step {
            step: "Assets ya descargados".into(), percent: 100,
        });
        return;
    }

    // Más concurrencia para assets (son archivos pequeños)
    download::download_many(items, 32, Some(app), "Assets").await;
    log::info!("[download_assets] ✓ Assets completados");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maven_path_with_and_without_classifier() {
        assert_eq!(
            maven_relative_path("net.fabricmc:fabric-loader:0.16.10").unwrap(),
            "net/fabricmc/fabric-loader/0.16.10/fabric-loader-0.16.10.jar"
        );
        assert_eq!(
            maven_relative_path("org.lwjgl:lwjgl:3.3.1:natives-linux").unwrap(),
            "org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-linux.jar"
        );
        assert!(maven_relative_path("roto").is_none());
    }
}
