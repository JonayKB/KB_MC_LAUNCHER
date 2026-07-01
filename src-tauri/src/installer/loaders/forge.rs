use crate::installer::download;
use crate::installer::progress::{emit, ProgressPayload};
use crate::installer::requirements::{
    check_java_by_minecraft_version, get_java_binary, install_java_by_minecraft_version,
};
use anyhow::{Context, Result};
use std::path::Path;
use tauri::AppHandle;

const VERSION_MANIFEST: &str = "https://launchermeta.mojang.com/mc/game/version_manifest.json";

pub async fn install(
    app: &AppHandle,
    versions_dir: &Path,
    instance_dir: &Path,
    mc_version: &str,
    forge_version: &str,
) -> Result<()> {
    log::info!("[forge::install] Iniciando instalación — MC {} | Forge {}", mc_version, forge_version);
    log::debug!("[forge::install] versions_dir: {:?}", versions_dir);
    log::debug!("[forge::install] instance_dir: {:?}", instance_dir);

    let launcher_root = versions_dir
        .parent()
        .context("No se pudo determinar la raíz del launcher")?;

    log::debug!("[forge::install] launcher_root: {:?}", launcher_root);

    // ── 0. Java ───────────────────────────────────────────────
    log::info!("[forge::install] Comprobando Java para MC {}...", mc_version);
    match check_java_by_minecraft_version(mc_version).await {
        Ok(true) => log::info!("[forge::install] Java OK"),
        Ok(false) => {
            log::warn!("[forge::install] Java no cumple requisitos, instalando...");
            emit(app, ProgressPayload::Step {
                step: "Java no cumple los requisitos. Instalando Java...".into(),
                percent: 0,
            });
            if let Err(e) = install_java_by_minecraft_version(mc_version).await {
                log::error!("[forge::install] Error instalando Java: {:#}", e);
                return Err(e);
            }
            log::info!("[forge::install] Java instalado correctamente");
        }
        Err(e) => {
            log::error!("[forge::install] Error comprobando Java: {:#}", e);
            return Err(e);
        }
    }

    let java_bin = get_java_binary(launcher_root);
    log::info!("[forge::install] Usando Java: {}", java_bin);

    tokio::fs::create_dir_all(versions_dir).await.ok();
    tokio::fs::create_dir_all(instance_dir).await.ok();

    // ── 1. JSON y JAR de vanilla ──────────────────────────────
    let mc_version_dir = versions_dir.join(mc_version);
    tokio::fs::create_dir_all(&mc_version_dir).await.ok();

    let mc_json_path = mc_version_dir.join(format!("{}.json", mc_version));
    let mc_jar_path  = mc_version_dir.join(format!("{}.jar",  mc_version));

    if !mc_json_path.exists() {
        log::info!("[forge::install] Descargando manifest de Mojang...");
        emit(app, ProgressPayload::Step {
            step: "Obteniendo manifest de Mojang...".into(), percent: 5,
        });

        let manifest: serde_json::Value = reqwest::get(VERSION_MANIFEST)
            .await?
            .json()
            .await
            .context("Error parseando manifest de Mojang")?;

        let version_url = manifest["versions"]
            .as_array().context("versions no es array")?
            .iter()
            .find(|v| v["id"].as_str() == Some(mc_version))
            .context(format!("Versión {} no encontrada en manifest", mc_version))?
            ["url"].as_str().context("url inválida")?.to_string();

        log::debug!("[forge::install] version_url: {}", version_url);

        emit(app, ProgressPayload::Step {
            step: format!("Descargando Minecraft {}.json...", mc_version), percent: 8,
        });

        let version_json_str = reqwest::get(&version_url)
            .await?.text().await
            .context("Error descargando version JSON")?;

        tokio::fs::write(&mc_json_path, &version_json_str).await?;
        log::info!("[forge::install] {}.json guardado en {:?}", mc_version, mc_json_path);
    } else {
        log::info!("[forge::install] {}.json ya existe, omitiendo descarga", mc_version);
    }

    if !mc_jar_path.exists() {
        log::info!("[forge::install] Descargando {}.jar...", mc_version);
        let mc_json_str = tokio::fs::read_to_string(&mc_json_path).await?;
        let mc_json: serde_json::Value = serde_json::from_str(&mc_json_str)?;
        let client_url = mc_json["downloads"]["client"]["url"]
            .as_str().context("URL del cliente vanilla no encontrada")?;

        log::debug!("[forge::install] client_url: {}", client_url);

        download::download_to(
            client_url, &mc_jar_path, Some(app),
            &format!("Descargando Minecraft {}.jar...", mc_version),
        ).await?;

        log::info!("[forge::install] {}.jar descargado OK ({:?})", mc_version, mc_jar_path);
    } else {
        log::info!("[forge::install] {}.jar ya existe, omitiendo descarga", mc_version);
    }

    // ── 2. launcher_profiles.json dummy ──────────────────────
    let profiles_path = launcher_root.join("launcher_profiles.json");
    if !profiles_path.exists() {
        log::debug!("[forge::install] Creando launcher_profiles.json dummy");
        tokio::fs::write(&profiles_path, r#"{"profiles":{}}"#)
            .await.context("No se pudo crear launcher_profiles.json")?;
    }

    // ── 3. Instalador de Forge ────────────────────────────────
    let installer_url = format!(
        "https://maven.minecraftforge.net/net/minecraftforge/forge/{mc}-{fv}/forge-{mc}-{fv}-installer.jar",
        mc = mc_version, fv = forge_version,
    );

    log::info!("[forge::install] Descargando instalador de Forge desde: {}", installer_url);

    let installer_path = download::download_to_temp_with_progress(
        app, &installer_url, "forge-installer.jar",
        &format!("Descargando Forge {}-{}...", mc_version, forge_version), 25,
    ).await.context("Error descargando Forge installer")?;

    log::info!("[forge::install] Instalador descargado en {:?}", installer_path);

    emit(app, ProgressPayload::Step {
        step: "Ejecutando instalador de Forge...".into(), percent: 40,
    });

    log::info!("[forge::install] Ejecutando: {} -jar {:?} --installClient {:?}",
        java_bin, installer_path, launcher_root);

    let output = tokio::process::Command::new(&java_bin)
        .args([
            "-jar", installer_path.to_str().unwrap(),
            "--installClient", launcher_root.to_str().unwrap(),
        ])
        .output().await
        .context("No se pudo ejecutar Java")?;

    tokio::fs::remove_file(&installer_path).await.ok();

    if !output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("[forge::install] Instalador falló con código {:?}", output.status.code());
        log::error!("[forge::install] STDOUT:\n{}", stdout);
        log::error!("[forge::install] STDERR:\n{}", stderr);
        anyhow::bail!(
            "El instalador de Forge falló con código {:?}\nSTDOUT:\n{}\nSTDERR:\n{}",
            output.status.code(), stdout, stderr
        );
    }

    log::info!("[forge::install] Instalador de Forge completado con éxito");

    // ── 4. Leer JSONs ─────────────────────────────────────────
    let forge_json_path = versions_dir
        .join(format!("{}-forge-{}", mc_version, forge_version))
        .join(format!("{}-forge-{}.json", mc_version, forge_version));

    log::debug!("[forge::install] Leyendo forge JSON: {:?}", forge_json_path);

    let forge_json: serde_json::Value = serde_json::from_str(
        &tokio::fs::read_to_string(&forge_json_path).await
            .context("No se pudo leer el JSON de Forge")?
    ).context("JSON de Forge inválido")?;

    let mc_json: serde_json::Value = serde_json::from_str(
        &tokio::fs::read_to_string(&mc_json_path).await
            .context("No se pudo leer el JSON de Minecraft")?
    ).context("JSON de Minecraft inválido")?;

    // ── 5. Libraries de Forge ─────────────────────────────────
    log::info!("[forge::install] Descargando libraries de Forge...");
    download_libraries(&forge_json, launcher_root, app, "Libraries Forge").await;
    log::info!("[forge::install] Libraries de Forge completadas");

    // ── 6. Libraries de Minecraft ─────────────────────────────
    log::info!("[forge::install] Descargando libraries de Minecraft...");
    download_libraries(&mc_json, launcher_root, app, "Libraries Minecraft").await;
    log::info!("[forge::install] Libraries de Minecraft completadas");

    // ── 7. Assets de vanilla ──────────────────────────────────
    log::info!("[forge::install] Descargando assets...");
    download_assets(&mc_json, launcher_root, app).await;
    log::info!("[forge::install] Assets completados");

    emit(app, ProgressPayload::Step {
        step: "Forge instalado con éxito".into(), percent: 100,
    });

    log::info!("[forge::install] ✓ Instalación completada — MC {} | Forge {}", mc_version, forge_version);
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
    log::debug!("[download_libraries] {} — {} libraries a procesar", label, total);

    for (i, lib) in libs.iter().enumerate() {
        let url  = lib["downloads"]["artifact"]["url"].as_str().unwrap();
        let path = lib["downloads"]["artifact"]["path"].as_str().unwrap();
        let dest = libs_dir.join(path);
        let percent = ((i + 1) as f64 / total as f64 * 100.0) as u8;

        if dest.exists() {
            log::trace!("[download_libraries] Ya existe ({}/{}): {}", i + 1, total, path);
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

        let filename = dest.file_name().and_then(|n| n.to_str()).unwrap_or(path);
        log::debug!("[download_libraries] Descargando ({}/{}): {}", i + 1, total, filename);

        let step_label = format!("{} ({}/{}) — {}", label, i + 1, total, filename);
        if let Err(e) = download::download_to(url, &dest, Some(app), &step_label).await {
            log::warn!("[download_libraries] Error descargando {}: {:#}", filename, e);
        }
    }

    log::debug!("[download_libraries] {} completado", label);
}

async fn download_assets(mc_json: &serde_json::Value, launcher_root: &Path, app: &AppHandle) {
    let asset_index_url = mc_json["assetIndex"]["url"].as_str();
    let asset_id        = mc_json["assetIndex"]["id"].as_str();

    let (Some(index_url), Some(id)) = (asset_index_url, asset_id) else {
        log::warn!("[download_assets] No se encontró assetIndex en el JSON de Minecraft");
        return;
    };

    log::info!("[download_assets] Asset index ID: {}", id);

    let indexes_dir = launcher_root.join("assets").join("indexes");
    tokio::fs::create_dir_all(&indexes_dir).await.ok();
    let index_path = indexes_dir.join(format!("{}.json", id));

    if !index_path.exists() {
        log::info!("[download_assets] Descargando índice de assets desde: {}", index_url);
        emit(app, ProgressPayload::Step {
            step: "Descargando índice de assets...".into(), percent: 0,
        });
        if let Err(e) = download::download_to(index_url, &index_path, Some(app), "Índice de assets").await {
            log::error!("[download_assets] Error descargando índice: {:#}", e);
            return;
        }
    } else {
        log::info!("[download_assets] Índice de assets ya existe");
    }

    let Ok(index_str) = tokio::fs::read_to_string(&index_path).await else {
        log::error!("[download_assets] No se pudo leer el índice de assets");
        return;
    };
    let Ok(index_json) = serde_json::from_str::<serde_json::Value>(&index_str) else {
        log::error!("[download_assets] Índice de assets JSON inválido");
        return;
    };
    let Some(objects) = index_json["objects"].as_object() else {
        log::error!("[download_assets] Campo 'objects' no encontrado en el índice");
        return;
    };

    let objects_dir = launcher_root.join("assets").join("objects");

    let pending: Vec<_> = objects.values()
        .filter_map(|obj| obj["hash"].as_str())
        .filter(|hash| {
            let prefix = &hash[..2];
            !objects_dir.join(prefix).join(hash).exists()
        })
        .collect();

    let total = pending.len();
    let already_downloaded = objects.len() - total;

    log::info!("[download_assets] {} assets totales — {} ya descargados — {} pendientes",
        objects.len(), already_downloaded, total);

    if total == 0 {
        log::info!("[download_assets] Todos los assets ya están descargados");
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

        log::trace!("[download_assets] ({}/{}) {}", i + 1, total, hash);

        let step_label = format!("Assets ({}/{}) — {}", i + 1, total, hash);
        if let Err(e) = download::download_to(&asset_url, &dest, Some(app), &step_label).await {
            log::warn!("[download_assets] Error descargando asset {}: {:#}", hash, e);
        }

        if i % 10 == 0 || i == total - 1 {
            log::debug!("[download_assets] Progreso: {}/{} ({}%)", i + 1, total, percent);
            emit(app, ProgressPayload::Extract {
                step: format!("Descargando assets ({}/{})", i + 1, total),
                percent,
                extracted_files: i + 1,
                total_files: total,
                speed_fps: 0.0,
            });
        }
    }

    log::info!("[download_assets] ✓ {} assets descargados", total);
}