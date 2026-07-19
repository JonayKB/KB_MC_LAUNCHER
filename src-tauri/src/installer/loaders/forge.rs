use crate::installer::download;
use crate::installer::progress::{emit, ProgressPayload};
use crate::installer::requirements::{
    check_java_by_minecraft_version, get_java_binary_async, install_java_by_minecraft_version,
};
use anyhow::{Context, Result};
use std::path::Path;
use tauri::AppHandle;
use tracing::{debug, error, info};

const VERSION_MANIFEST: &str = "https://launchermeta.mojang.com/mc/game/version_manifest.json";

pub async fn install(
    app: &AppHandle,
    versions_dir: &Path,
    instance_dir: &Path,
    mc_version: &str,
    forge_version: &str,
) -> Result<()> {
    info!(
        "[forge::install] Iniciando instalación — MC {} | Forge {}",
        mc_version, forge_version
    );
    debug!("[forge::install] versions_dir: {:?}", versions_dir);
    debug!("[forge::install] instance_dir: {:?}", instance_dir);

    let launcher_root = versions_dir
        .parent()
        .context("No se pudo determinar la raíz del launcher")?;

    debug!("[forge::install] launcher_root: {:?}", launcher_root);

    // ── 0. Java ───────────────────────────────────────────────
    info!(
        "[forge::install] Comprobando Java para MC {}...",
        mc_version
    );
    if !check_java_by_minecraft_version(mc_version, launcher_root).await {
        install_java_by_minecraft_version(mc_version, launcher_root).await?;
    }

    let java_bin = get_java_binary_async(launcher_root, mc_version).await;
    info!("[forge::install] Usando Java: {}", java_bin);

    tokio::fs::create_dir_all(versions_dir).await.ok();
    tokio::fs::create_dir_all(instance_dir).await.ok();

    // ── 1. JSON y JAR de vanilla ──────────────────────────────
    let mc_version_dir = versions_dir.join(mc_version);
    tokio::fs::create_dir_all(&mc_version_dir).await.ok();

    let mc_json_path = mc_version_dir.join(format!("{}.json", mc_version));
    let mc_jar_path = mc_version_dir.join(format!("{}.jar", mc_version));

    if !mc_json_path.exists() {
        info!("[forge::install] Descargando manifest de Mojang...");
        emit(
            app,
            ProgressPayload::Step {
                step: "Obteniendo manifest de Mojang...".into(),
                percent: 5,
            },
        );

        let manifest: serde_json::Value = reqwest::get(VERSION_MANIFEST)
            .await?
            .json()
            .await
            .context("Error parseando manifest de Mojang")?;

        let version_url = manifest["versions"]
            .as_array()
            .context("versions no es array")?
            .iter()
            .find(|v| v["id"].as_str() == Some(mc_version))
            .context(format!("Versión {} no encontrada en manifest", mc_version))?["url"]
            .as_str()
            .context("url inválida")?
            .to_string();

        debug!("[forge::install] version_url: {}", version_url);

        emit(
            app,
            ProgressPayload::Step {
                step: format!("Descargando Minecraft {}.json...", mc_version),
                percent: 8,
            },
        );

        let version_json_str = reqwest::get(&version_url)
            .await?
            .text()
            .await
            .context("Error descargando version JSON")?;

        tokio::fs::write(&mc_json_path, &version_json_str).await?;
        info!(
            "[forge::install] {}.json guardado en {:?}",
            mc_version, mc_json_path
        );
    } else {
        info!(
            "[forge::install] {}.json ya existe, omitiendo descarga",
            mc_version
        );
    }

    if !mc_jar_path.exists() {
        info!("[forge::install] Descargando {}.jar...", mc_version);
        let mc_json_str = tokio::fs::read_to_string(&mc_json_path).await?;
        let mc_json: serde_json::Value = serde_json::from_str(&mc_json_str)?;
        let client_url = mc_json["downloads"]["client"]["url"]
            .as_str()
            .context("URL del cliente vanilla no encontrada")?;

        debug!("[forge::install] client_url: {}", client_url);

        download::download_to(
            client_url,
            &mc_jar_path,
            Some(app),
            &format!("Descargando Minecraft {}.jar...", mc_version),
        )
        .await?;

        info!(
            "[forge::install] {}.jar descargado OK ({:?})",
            mc_version, mc_jar_path
        );
    } else {
        info!(
            "[forge::install] {}.jar ya existe, omitiendo descarga",
            mc_version
        );
    }

    // ── 2. launcher_profiles.json dummy ──────────────────────
    let profiles_path = launcher_root.join("launcher_profiles.json");
    if !profiles_path.exists() {
        debug!("[forge::install] Creando launcher_profiles.json dummy");
        tokio::fs::write(&profiles_path, r#"{"profiles":{}}"#)
            .await
            .context("No se pudo crear launcher_profiles.json")?;
    }

    // ── 3. Instalador de Forge ────────────────────────────────
    let installer_url = format!(
        "https://maven.minecraftforge.net/net/minecraftforge/forge/{mc}-{fv}/forge-{mc}-{fv}-installer.jar",
        mc = mc_version, fv = forge_version,
    );

    info!(
        "[forge::install] Descargando instalador de Forge desde: {}",
        installer_url
    );

    let installer_path = download::download_to_temp_with_progress(
        app,
        &installer_url,
        "forge-installer.jar",
        &format!("Descargando Forge {}-{}...", mc_version, forge_version),
        25,
    )
    .await
    .context("Error descargando Forge installer")?;

    info!(
        "[forge::install] Instalador descargado en {:?}",
        installer_path
    );

    emit(
        app,
        ProgressPayload::Step {
            step: "Ejecutando instalador de Forge...".into(),
            percent: 40,
        },
    );

    info!(
        "[forge::install] Ejecutando: {} -jar {:?} --installClient {:?}",
        java_bin, installer_path, launcher_root
    );

    let output = tokio::process::Command::new(&java_bin)
        .args([
            "-jar",
            installer_path.to_str().unwrap(),
            "--installClient",
            launcher_root.to_str().unwrap(),
        ])
        .output()
        .await
        .context("No se pudo ejecutar Java")?;

    tokio::fs::remove_file(&installer_path).await.ok();

    if !output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!(
            "[forge::install] Instalador falló con código {:?}",
            output.status.code()
        );
        error!("[forge::install] STDOUT:\n{}", stdout);
        error!("[forge::install] STDERR:\n{}", stderr);
        anyhow::bail!(
            "El instalador de Forge falló con código {:?}\nSTDOUT:\n{}\nSTDERR:\n{}",
            output.status.code(),
            stdout,
            stderr
        );
    }

    info!("[forge::install] Instalador de Forge completado con éxito");

    // ── 4. Leer JSONs ─────────────────────────────────────────
    let forge_json_path = versions_dir
        .join(format!("{}-forge-{}", mc_version, forge_version))
        .join(format!("{}-forge-{}.json", mc_version, forge_version));

    debug!("[forge::install] Leyendo forge JSON: {:?}", forge_json_path);

    let forge_json: serde_json::Value = serde_json::from_str(
        &tokio::fs::read_to_string(&forge_json_path)
            .await
            .context("No se pudo leer el JSON de Forge")?,
    )
    .context("JSON de Forge inválido")?;

    let mc_json: serde_json::Value = serde_json::from_str(
        &tokio::fs::read_to_string(&mc_json_path)
            .await
            .context("No se pudo leer el JSON de Minecraft")?,
    )
    .context("JSON de Minecraft inválido")?;

    // ── 5. Libraries de Forge ─────────────────────────────────
    info!("[forge::install] Descargando libraries de Forge...");
    download_libraries(&forge_json, launcher_root, app, "Libraries Forge")
        .await
        .context("Fallo descargando libraries de Forge")?;
    info!("[forge::install] Libraries de Forge completadas");

    // ── 6. Libraries de Minecraft ─────────────────────────────
    info!("[forge::install] Descargando libraries de Minecraft...");
    download_libraries(&mc_json, launcher_root, app, "Libraries Minecraft")
        .await
        .context("Fallo descargando libraries de Minecraft")?;
    info!("[forge::install] Libraries de Minecraft completadas");

    // ── 7. Assets de vanilla ──────────────────────────────────
    info!("[forge::install] Descargando assets...");
    download_assets(&mc_json, launcher_root, app)
        .await
        .context("Fallo descargando assets")?;
    info!("[forge::install] Assets completados");

    emit(
        app,
        ProgressPayload::Step {
            step: "Forge instalado con éxito".into(),
            percent: 100,
        },
    );

    info!(
        "[forge::install] ✓ Instalación completada — MC {} | Forge {}",
        mc_version, forge_version
    );
    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────

async fn download_libraries(
    json: &serde_json::Value,
    launcher_root: &Path,
    app: &AppHandle,
    label: &str,
) -> Result<()> {
    let libs_dir = launcher_root.join("libraries");

    let items: Vec<(String, std::path::PathBuf)> = json["libraries"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|lib| {
                    let url = lib["downloads"]["artifact"]["url"].as_str()?;
                    let path = lib["downloads"]["artifact"]["path"].as_str()?;
                    if url.is_empty() {
                        return None;
                    }
                    Some((url.to_string(), libs_dir.join(path)))
                })
                .collect()
        })
        .unwrap_or_default();

    info!(
        "[download_libraries] {} — {} items en paralelo",
        label,
        items.len()
    );

    let failures = download::download_many(items, 16, Some(app), label).await;

    if !failures.is_empty() {
        for f in &failures {
            error!(
                "[download_libraries] {} — fallo definitivo: {} ({})",
                label,
                f.dest.display(),
                f.error
            );
        }
        anyhow::bail!(
            "{}: {} archivo(s) no se pudieron descargar tras varios intentos. Revisa tu conexión e inténtalo de nuevo.",
            label,
            failures.len()
        );
    }

    info!("[download_libraries] {} completado", label);
    Ok(())
}

async fn download_assets(
    mc_json: &serde_json::Value,
    launcher_root: &Path,
    app: &AppHandle,
) -> Result<()> {
    let asset_index_url = mc_json["assetIndex"]["url"]
        .as_str()
        .context("assetIndex.url no encontrado en el JSON de Minecraft")?;
    let asset_id = mc_json["assetIndex"]["id"]
        .as_str()
        .context("assetIndex.id no encontrado en el JSON de Minecraft")?;

    let indexes_dir = launcher_root.join("assets").join("indexes");
    tokio::fs::create_dir_all(&indexes_dir).await.ok();
    let index_path = indexes_dir.join(format!("{}.json", asset_id));

    // Verificar no solo existencia, también que no esté vacío/corrupto de un intento anterior
    let index_valid = match tokio::fs::metadata(&index_path).await {
        Ok(meta) => meta.len() > 0,
        Err(_) => false,
    };

    if !index_valid {
        emit(
            app,
            ProgressPayload::Step {
                step: "Descargando índice de assets...".into(),
                percent: 0,
            },
        );
        // ANTES: .ok() se tragaba el error y dejaba el índice ausente/corrupto en silencio.
        // AHORA: se propaga con `?`, así que si falla, la instalación entera falla con
        // un mensaje claro en vez de arrancar el juego sin sonidos/texturas.
        download::download_to(asset_index_url, &index_path, None, "")
            .await
            .context("No se pudo descargar el índice de assets")?;
    }

    let index_str = tokio::fs::read_to_string(&index_path)
        .await
        .context("No se pudo leer el índice de assets recién descargado")?;
    let index_json: serde_json::Value = serde_json::from_str(&index_str)
        .context("El índice de assets descargado no es un JSON válido")?;
    let objects = index_json["objects"]
        .as_object()
        .context("El índice de assets no contiene 'objects'")?;

    let objects_dir = launcher_root.join("assets").join("objects");

    let items: Vec<(String, std::path::PathBuf)> = objects
        .values()
        .filter_map(|obj| obj["hash"].as_str())
        .map(|hash| {
            let prefix = &hash[..2];
            let dest = objects_dir.join(prefix).join(hash);
            let url = format!(
                "https://resources.download.minecraft.net/{}/{}",
                prefix, hash
            );
            (url, dest)
        })
        .collect();

    let total = items.len();
    let already = items.iter().filter(|(_, d)| d.exists()).count();
    let pending = total - already;

    info!(
        "[download_assets] {} assets totales — {} ya descargados — {} pendientes",
        total, already, pending
    );

    if pending == 0 {
        emit(
            app,
            ProgressPayload::Step {
                step: "Assets ya descargados".into(),
                percent: 100,
            },
        );
        return Ok(());
    }

    // Concurrencia moderada: 32 en paralelo estaba gatillando rate-limit de Mojang
    // en ráfagas, causando decenas de fallos simultáneos. 20 es más conservador.
    let failures = download::download_many(items, 20, Some(app), "Assets").await;

    if !failures.is_empty() {
        for f in &failures {
            error!(
                "[download_assets] Fallo definitivo: {} ({})",
                f.dest.display(),
                f.error
            );
        }
        anyhow::bail!(
            "No se pudieron descargar {} de {} assets tras varios intentos. Revisa tu conexión e inténtalo de nuevo.",
            failures.len(),
            total
        );
    }

    info!("[download_assets] ✓ Assets completados");
    Ok(())
}
