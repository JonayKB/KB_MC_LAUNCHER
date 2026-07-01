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
    forge_version: &str,
) -> Result<()> {
    let launcher_root = versions_dir.parent()
        .context("No se pudo determinar la raíz del launcher")?;

    tokio::fs::create_dir_all(versions_dir).await.ok();
    tokio::fs::create_dir_all(instance_dir).await.ok();

    // ── 1. Descargar JSON y JAR de vanilla ───────────────────
    let mc_version_dir = versions_dir.join(mc_version);
    tokio::fs::create_dir_all(&mc_version_dir).await.ok();

    let mc_json_path = mc_version_dir.join(format!("{}.json", mc_version));
    let mc_jar_path  = mc_version_dir.join(format!("{}.jar",  mc_version));

    if !mc_json_path.exists() {
        emit(app, ProgressPayload::Step {
            step: "Obteniendo manifest de Mojang...".into(), percent: 5,
        });
        let manifest: serde_json::Value = reqwest::get(VERSION_MANIFEST).await?
            .json().await.context("Error parseando manifest de Mojang")?;

        let version_url = manifest["versions"]
            .as_array().context("versions no es array")?
            .iter()
            .find(|v| v["id"].as_str() == Some(mc_version))
            .context(format!("Versión {} no encontrada en manifest", mc_version))?
            ["url"].as_str().context("url inválida")?.to_string();

        emit(app, ProgressPayload::Step {
            step: format!("Descargando Minecraft {}.json...", mc_version), percent: 8,
        });
        let version_json_str = reqwest::get(&version_url).await?
            .text().await.context("Error descargando version JSON")?;
        tokio::fs::write(&mc_json_path, &version_json_str).await?;
    }

    if !mc_jar_path.exists() {
        let mc_json_str = tokio::fs::read_to_string(&mc_json_path).await?;
        let mc_json: serde_json::Value = serde_json::from_str(&mc_json_str)?;
        let client_url = mc_json["downloads"]["client"]["url"]
            .as_str().context("URL del cliente vanilla no encontrada")?;

        download::download_to(
            client_url,
            &mc_jar_path,
            Some(app),
            &format!("Descargando Minecraft {}.jar...", mc_version),
        ).await?;
    }

    // ── 2. launcher_profiles.json dummy ──────────────────────
    let profiles_path = launcher_root.join("launcher_profiles.json");
    if !profiles_path.exists() {
        tokio::fs::write(&profiles_path, r#"{"profiles":{}}"#).await
            .context("No se pudo crear launcher_profiles.json")?;
    }

    // ── 3. Descargar y ejecutar instalador de Forge ──────────
    let installer_url = format!(
        "https://maven.minecraftforge.net/net/minecraftforge/forge/{mc}-{fv}/forge-{mc}-{fv}-installer.jar",
        mc = mc_version, fv = forge_version,
    );
    let installer_path = download::download_to_temp_with_progress(
        app,
        &installer_url,
        "forge-installer.jar",
        &format!("Descargando Forge {}-{}...", mc_version, forge_version),
        25,
    ).await.context("Error descargando Forge installer")?;

    emit(app, ProgressPayload::Step {
        step: "Ejecutando instalador de Forge...".into(), percent: 40,
    });
    let output = tokio::process::Command::new("java")
        .args([
            "-jar", installer_path.to_str().unwrap(),
            "--installClient", launcher_root.to_str().unwrap(),
        ])
        .output().await
        .context("No se pudo ejecutar Java. ¿Está instalado?")?;

    tokio::fs::remove_file(&installer_path).await.ok();

    if !output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!(
            "El instalador de Forge falló con código {:?}\nSTDOUT:\n{}\nSTDERR:\n{}",
            output.status.code(), stdout, stderr
        );
    }

    // ── 4. Leer JSONs ─────────────────────────────────────────
    let forge_json_path = versions_dir
        .join(format!("{}-forge-{}", mc_version, forge_version))
        .join(format!("{}-forge-{}.json", mc_version, forge_version));

    let forge_json: serde_json::Value = serde_json::from_str(
        &tokio::fs::read_to_string(&forge_json_path).await
            .context("No se pudo leer el JSON de Forge")?
    ).context("JSON de Forge inválido")?;

    let mc_json: serde_json::Value = serde_json::from_str(
        &tokio::fs::read_to_string(&mc_json_path).await
            .context("No se pudo leer el JSON de Minecraft")?
    ).context("JSON de Minecraft inválido")?;

    // ── 5. Libraries de Forge ─────────────────────────────────
    download_libraries(&forge_json, launcher_root, app, "Libraries Forge").await;

    // ── 6. Libraries de Minecraft ─────────────────────────────
    download_libraries(&mc_json, launcher_root, app, "Libraries Minecraft").await;

    // ── 7. Assets de vanilla ──────────────────────────────────
    download_assets(&mc_json, launcher_root, app).await;

    emit(app, ProgressPayload::Step {
        step: "Forge instalado con éxito".into(), percent: 100,
    });
    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────

async fn download_libraries(
    json: &serde_json::Value,
    launcher_root: &Path,
    app: &AppHandle,
    label: &str,
) {
    let libs_dir = launcher_root.join("libraries");
    let libs: Vec<_> = json["libraries"]
        .as_array()
        .map(|arr| arr.iter().filter(|lib| {
            let url  = lib["downloads"]["artifact"]["url"].as_str().unwrap_or("");
            let path = lib["downloads"]["artifact"]["path"].as_str().unwrap_or("");
            !url.is_empty() && !path.is_empty()
        }).collect())
        .unwrap_or_default();

    let total = libs.len();

    for (i, lib) in libs.iter().enumerate() {
        let url  = lib["downloads"]["artifact"]["url"].as_str().unwrap();
        let path = lib["downloads"]["artifact"]["path"].as_str().unwrap();
        let dest = libs_dir.join(path);
        let percent = ((i + 1) as f64 / total as f64 * 100.0) as u8;

        if dest.exists() {
            emit(app, ProgressPayload::Extract {
                step: format!("{} ({}/{})", label, i + 1, total),
                percent,
                extracted_files: i + 1,
                total_files: total,
                speed_fps: 0.0,
            });
            continue;
        }

        if let Some(parent) = dest.parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }

        let filename = dest.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(path);

        let step_label = format!("{} ({}/{}) — {}", label, i + 1, total, filename);
        download::download_to(url, &dest, Some(app), &step_label).await.ok();
    }
}

async fn download_assets(mc_json: &serde_json::Value, launcher_root: &Path, app: &AppHandle) {
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
        download::download_to(index_url, &index_path, Some(app), "Índice de assets").await.ok();
    }

    let Ok(index_str) = tokio::fs::read_to_string(&index_path).await else { return };
    let Ok(index_json) = serde_json::from_str::<serde_json::Value>(&index_str) else { return };
    let Some(objects) = index_json["objects"].as_object() else { return };

    let objects_dir = launcher_root.join("assets").join("objects");

    // Filtrar solo los que faltan para tener el total real
    let pending: Vec<_> = objects.values()
        .filter_map(|obj| obj["hash"].as_str())
        .filter(|hash| {
            let prefix = &hash[..2];
            !objects_dir.join(prefix).join(hash).exists()
        })
        .collect();

    let total = pending.len();

    if total == 0 {
        emit(app, ProgressPayload::Step {
            step: "Assets ya descargados".into(), percent: 100,
        });
        return;
    }

    for (i, hash) in pending.iter().enumerate() {
        let prefix = &hash[..2];
        let dest = objects_dir.join(prefix).join(hash);
        let percent = ((i + 1) as f64 / total as f64 * 100.0) as u8;

        tokio::fs::create_dir_all(dest.parent().unwrap()).await.ok();

        let asset_url = format!(
            "https://resources.download.minecraft.net/{}/{}",
            prefix, hash
        );
        let step_label = format!("Assets ({}/{}) — {}", i + 1, total, hash);
        download::download_to(&asset_url, &dest, Some(app), &step_label).await.ok();

        // Emit de progreso global de assets cada 10 archivos para no saturar
        if i % 10 == 0 || i == total - 1 {
            emit(app, ProgressPayload::Extract {
                step: format!("Descargando assets ({}/{})", i + 1, total),
                percent,
                extracted_files: i + 1,
                total_files: total,
                speed_fps: 0.0,
            });
        }
    }
}