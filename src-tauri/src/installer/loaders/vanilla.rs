use crate::installer::progress::{self, emit, ProgressPayload, Reporter};
use crate::installer::requirements::{ensure_java, required_java_major};
use crate::installer::rules::{library_files, maven_relative_path};
use crate::installer::{download, http};
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tracing::{error, info};

const VERSION_MANIFEST: &str =
    "https://launchermeta.mojang.com/mc/game/version_manifest.json";

pub async fn install(reporter: &Reporter, versions_dir: &Path, mc_version: &str) -> Result<()> {
    prepare(reporter, versions_dir, mc_version, (0, 100)).await?;
    emit(reporter, ProgressPayload::Step { step: "Minecraft instalado".into(), percent: 100 });
    Ok(())
}

/// Lo que ya tiene Minecraft vanilla descargado: su JSON y el Java que necesita
pub struct PreparedMinecraft {
    pub mc_json: serde_json::Value,
    pub java_bin: PathBuf,
}

/// JSON de la versión de Minecraft, descargándolo si aún no está
async fn version_json(versions_dir: &Path, mc_version: &str) -> Result<serde_json::Value> {
    let version_dir = versions_dir.join(mc_version);
    tokio::fs::create_dir_all(&version_dir).await?;
    let json_path = version_dir.join(format!("{}.json", mc_version));

    if !json_path.exists() {
        let manifest: serde_json::Value = http::get_json(VERSION_MANIFEST).await?;
        let version_url = manifest["versions"]
            .as_array().context("versions no es array")?
            .iter()
            .find(|v| v["id"].as_str() == Some(mc_version))
            .context(format!("Versión {} no encontrada", mc_version))?["url"]
            .as_str().context("url inválida")?.to_string();

        let version_json = http::get_text(&version_url).await?;
        // Validar antes de guardarlo: si no, quedaría roto para siempre
        serde_json::from_str::<serde_json::Value>(&version_json)
            .context("JSON de Minecraft inválido")?;
        tokio::fs::write(&json_path, version_json).await?;
    }

    serde_json::from_str(&tokio::fs::read_to_string(&json_path).await?)
        .context("JSON de Minecraft inválido")
}

/// Deja listo Minecraft vanilla: Java, JSON, jar, libraries y assets.
/// Ocupa de `span.0`% a `span.1`% del paso en curso; los loaders usan el resto.
pub async fn prepare(
    reporter: &Reporter,
    versions_dir: &Path,
    mc_version: &str,
    span: (u8, u8),
) -> Result<PreparedMinecraft> {
    let launcher_root = versions_dir
        .parent()
        .context("No se pudo determinar la raíz del launcher")?;
    let at = |percent: u32| (span.0 as u32 + (span.1 - span.0) as u32 * percent / 100) as u8;

    progress::sub_range(at(0), at(5));
    emit(reporter, ProgressPayload::Step { step: "Obteniendo datos de Minecraft...".into(), percent: 0 });
    let mc_json = version_json(versions_dir, mc_version).await?;

    let java_major = required_java_major(mc_version, &[&mc_json]);
    let java_bin = ensure_java(java_major, launcher_root, reporter).await?;

    // ── Jar del cliente ───────────────────────────────────────
    progress::sub_range(at(5), at(25));
    let jar_path = versions_dir.join(mc_version).join(format!("{}.jar", mc_version));
    if !jar_path.exists() {
        let client_url = mc_json["downloads"]["client"]["url"]
            .as_str().context("URL del cliente no encontrada")?;
        download::download_resumable(
            client_url, &jar_path, Some(reporter),
            &format!("Descargando Minecraft {}...", mc_version),
        ).await?;
    }

    progress::sub_range(at(25), at(50));
    download_libraries(&mc_json, launcher_root, reporter, "Libraries Minecraft").await?;
    progress::sub_range(at(50), at(100));
    download_assets(&mc_json, launcher_root, reporter).await?;

    Ok(PreparedMinecraft { mc_json, java_bin })
}

// ── Helpers compartidos con los loaders ───────────────────────

pub async fn download_libraries(
    json: &serde_json::Value,
    launcher_root: &Path,
    reporter: &Reporter,
    label: &str,
) -> Result<()> {
    let libs_dir = launcher_root.join("libraries");

    // Solo las de este sistema, y con los nativos antiguos si los hay
    let items: Vec<(String, PathBuf)> = library_files(json)
        .into_iter()
        .map(|(url, path)| (url, libs_dir.join(path)))
        .collect();

    info!(
        "[download_libraries] {} — {} items en paralelo",
        label,
        items.len()
    );

    let failures = download::download_many(items, 16, Some(reporter), label).await;

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

pub async fn download_assets(
    mc_json: &serde_json::Value,
    launcher_root: &Path,
    reporter: &Reporter,
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
            reporter,
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
            reporter,
            ProgressPayload::Step {
                step: "Assets ya descargados".into(),
                percent: 100,
            },
        );
        return Ok(());
    }

    // Concurrencia moderada: 32 en paralelo estaba gatillando rate-limit de Mojang
    // en ráfagas, causando decenas de fallos simultáneos. 20 es más conservador.
    let failures = download::download_many(items, 20, Some(reporter), "Assets").await;

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

/// Descarga libraries en formato Maven (`name` + `url` base), como las de Fabric
pub async fn download_maven_libraries(
    json: &serde_json::Value,
    launcher_root: &Path,
    reporter: &Reporter,
    label: &str,
) -> Result<()> {
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

    info!("[download_maven_libraries] {} — {} items en paralelo", label, items.len());
    let failures = download::download_many(items, 16, Some(reporter), label).await;
    if !failures.is_empty() {
        for f in &failures {
            error!("[download_maven_libraries] {} — fallo definitivo: {} ({})", label, f.dest.display(), f.error);
        }
        anyhow::bail!(
            "{}: {} archivo(s) no se pudieron descargar tras varios intentos. Revisa tu conexión e inténtalo de nuevo.",
            label,
            failures.len()
        );
    }
    Ok(())
}
