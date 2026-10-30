pub mod download;
pub mod extract;
pub mod http;
pub mod loaders;
pub mod progress;
pub mod requirements;
pub mod rules;
pub mod sysinfo;

use anyhow::{bail, Context, Result};
use progress::emit;
pub use progress::{ProgressPayload, Reporter};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// Fichero dentro de la instancia con la versión del modpack instalada
pub const INSTALLED_VERSION_FILE: &str = "installed_version";
/// Se prepara aquí todo lo nuevo; la instancia no se toca hasta tenerlo completo
pub const STAGING_DIR: &str = ".kb-staging";

/// Tramos de la barra (0-100) para las cuatro etapas de los archivos del modpack
struct ContentPlan {
    step: u8,
    steps: u8,
    bounds: [u8; 5],
}

/// Un loader_version vacío equivale a no tenerlo
fn required_version(version: Option<String>, loader: &str) -> Result<String> {
    version
        .filter(|v| !v.trim().is_empty())
        .with_context(|| format!("{} requiere loader_version", loader))
}

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
    install_with(
        Reporter::new(app),
        Path::new(&base_path),
        &mc_version,
        &loader,
        loader_version,
        &overrides_url,
        &mods_url,
        &modpack_id,
        modpack_version.as_deref(),
    )
    .await
}

pub async fn install_with(
    reporter: Reporter,
    base: &Path,
    mc_version: &str,
    loader: &str,
    loader_version: Option<String>,
    overrides_url: &str,
    mods_url: &str,
    modpack_id: &str,
    modpack_version: Option<&str>,
) -> Result<()> {
    progress::reset();
    let versions_dir = base.join("versions");
    let instance_dir = base.join("instances").join(modpack_id);

    tokio::fs::create_dir_all(&versions_dir).await?;
    tokio::fs::create_dir_all(&instance_dir).await?;

    // Pasos: 1 Minecraft + loader, 2 mods, 3 configuración (overrides)
    progress::set_phase(1, 3, 0, 55);
    emit(
        &reporter,
        ProgressPayload::Step {
            step: "Instalando Minecraft y el loader...".into(),
            percent: 0,
        },
    );
    match loader {
        "forge" => {
            let ver = required_version(loader_version, "Forge")?;
            loaders::forge::install(&reporter, &versions_dir, mc_version, &ver).await?;
        }
        "neoforge" => {
            let ver = required_version(loader_version, "NeoForge")?;
            loaders::neoforge::install(&reporter, &versions_dir, mc_version, &ver).await?;
        }
        "fabric" => {
            let ver = required_version(loader_version, "Fabric")?;
            loaders::fabric::install(&reporter, &versions_dir, mc_version, &ver).await?;
        }
        "vanilla" => loaders::vanilla::install(&reporter, &versions_dir, mc_version).await?,
        other => bail!("El loader '{}' no está soportado", other),
    }

    let plan = ContentPlan { step: 2, steps: 3, bounds: [55, 85, 90, 97, 100] };
    apply_content(&reporter, &instance_dir, mods_url, overrides_url, modpack_version, plan).await?;

    emit(
        &reporter,
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
    update_with(
        Reporter::new(app),
        Path::new(&base_path),
        &overrides_url,
        &mods_url,
        &modpack_id,
        modpack_version.as_deref(),
    )
    .await
}

pub async fn update_with(
    reporter: Reporter,
    base: &Path,
    overrides_url: &str,
    mods_url: &str,
    modpack_id: &str,
    modpack_version: Option<&str>,
) -> Result<()> {
    progress::reset();
    let instance_dir = base.join("instances").join(modpack_id);

    if !instance_dir.join("mods").exists() {
        bail!("El modpack no está instalado");
    }

    let plan = ContentPlan { step: 1, steps: 2, bounds: [0, 80, 88, 97, 100] };
    apply_content(&reporter, &instance_dir, mods_url, overrides_url, modpack_version, plan).await?;

    emit(
        &reporter,
        ProgressPayload::Step {
            step: "Actualización completada".into(),
            percent: 100,
        },
    );
    Ok(())
}

/// Descarga y prepara mods y overrides aparte, y solo con todo listo sustituye
/// lo instalado. Si algo falla antes, la instancia sigue como estaba.
async fn apply_content(
    reporter: &Reporter,
    instance_dir: &Path,
    mods_url: &str,
    overrides_url: &str,
    modpack_version: Option<&str>,
    plan: ContentPlan,
) -> Result<()> {
    let ContentPlan { step, steps, bounds } = plan;
    let staging = instance_dir.join(STAGING_DIR);
    if staging.exists() {
        tokio::fs::remove_dir_all(&staging).await?;
    }
    tokio::fs::create_dir_all(&staging).await?;

    let mods_zip = staging.join("mods.zip");
    let overrides_zip = staging.join("overrides.zip");
    let staged_mods = staging.join("mods");
    let staged_overrides = staging.join("overrides");
    tokio::fs::create_dir_all(&staged_mods).await?;
    tokio::fs::create_dir_all(&staged_overrides).await?;

    progress::set_phase(step, steps, bounds[0], bounds[1]);
    download::download_resumable(mods_url, &mods_zip, Some(reporter), "Descargando mods...").await?;
    progress::set_phase(step, steps, bounds[1], bounds[2]);
    extract::extract_zip(&mods_zip, &staged_mods, true, Some(reporter), "Extrayendo mods...").await?;

    progress::set_phase(step + 1, steps, bounds[2], bounds[3]);
    download::download_resumable(overrides_url, &overrides_zip, Some(reporter), "Descargando overrides...").await?;
    progress::set_phase(step + 1, steps, bounds[3], bounds[4]);
    extract::extract_zip(&overrides_zip, &staged_overrides, true, Some(reporter), "Aplicando overrides...").await?;

    let instance_dir = instance_dir.to_owned();
    let version = modpack_version.unwrap_or("???").to_string();
    extract::run_uninterrupted(move || commit_content(&instance_dir, &version)).await
}

/// Paso final, en disco y sin red: rápido y con vuelta atrás si no se pueden cambiar los mods
fn commit_content(instance_dir: &Path, version: &str) -> Result<()> {
    let staging = instance_dir.join(STAGING_DIR);
    let mods_dir = instance_dir.join("mods");
    let old_mods = staging.join("mods.old");
    let version_file = instance_dir.join(INSTALLED_VERSION_FILE);
    let previous_version = std::fs::read_to_string(&version_file).ok();

    // Hasta terminar, la instancia consta como incompleta
    std::fs::write(&version_file, "").context("No se pudo marcar la instancia")?;

    let swapped = (|| -> Result<()> {
        if mods_dir.exists() {
            rename_with_retries(&mods_dir, &old_mods)?;
        }
        if let Err(e) = rename_with_retries(&staging.join("mods"), &mods_dir) {
            if old_mods.exists() {
                rename_with_retries(&old_mods, &mods_dir).ok();
            }
            return Err(e);
        }
        Ok(())
    })();

    if let Err(e) = swapped {
        match previous_version {
            Some(previous) => std::fs::write(&version_file, previous).ok(),
            None => std::fs::remove_file(&version_file).ok(),
        };
        return Err(e).context("No se pudieron sustituir los mods. ¿Hay algún archivo abierto?");
    }

    move_tree(&staging.join("overrides"), instance_dir).context("No se pudieron aplicar los overrides")?;
    std::fs::write(&version_file, version).context("No se pudo guardar la versión instalada")?;
    std::fs::remove_dir_all(&staging).ok();
    Ok(())
}

/// En Windows el antivirus o el indexador pueden retener un archivo unos instantes
fn rename_with_retries(from: &Path, to: &Path) -> Result<()> {
    const ATTEMPTS: u32 = 8;
    for attempt in 1..=ATTEMPTS {
        match std::fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(e) if attempt == ATTEMPTS => {
                return Err(e).with_context(|| format!("No se pudo mover {:?} a {:?}", from, to));
            }
            Err(_) => std::thread::sleep(std::time::Duration::from_millis(250)),
        }
    }
    Ok(())
}

/// Mueve el contenido de `from` sobre `to`, sustituyendo lo que coincida
fn move_tree(from: &Path, to: &Path) -> Result<()> {
    let mut pending: Vec<PathBuf> = vec![from.to_path_buf()];
    while let Some(dir) = pending.pop() {
        for entry in std::fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            let relative = path.strip_prefix(from)?;
            let target = to.join(relative);
            if entry.file_type()?.is_dir() {
                std::fs::create_dir_all(&target)?;
                pending.push(path);
            } else {
                rename_with_retries(&path, &target)?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::routing::get;
    use std::io::Write;

    fn zip_bytes(files: &[(&str, &str)]) -> Vec<u8> {
        let mut out = std::io::Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(&mut out);
        for (name, content) in files {
            zip.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
            zip.write_all(content.as_bytes()).unwrap();
        }
        zip.finish().unwrap();
        out.into_inner()
    }

    async fn server(mods: Vec<u8>, overrides: Vec<u8>) -> String {
        let app = axum::Router::new()
            .route("/mods.zip", get(move || { let b = mods.clone(); async move { b } }))
            .route("/overrides.zip", get(move || { let b = overrides.clone(); async move { b } }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await });
        format!("http://{}", addr)
    }

    fn installed_instance(base: &Path) -> PathBuf {
        let instance = base.join("instances").join("pack");
        std::fs::create_dir_all(instance.join("mods")).unwrap();
        std::fs::create_dir_all(instance.join("config")).unwrap();
        std::fs::write(instance.join("mods").join("viejo.jar"), "v1").unwrap();
        std::fs::write(instance.join("config").join("a.toml"), "v1").unwrap();
        std::fs::write(instance.join("options.txt"), "del jugador").unwrap();
        std::fs::write(instance.join(INSTALLED_VERSION_FILE), "1.0").unwrap();
        instance
    }

    #[tokio::test]
    async fn update_replaces_mods_and_merges_overrides() {
        let dir = tempfile::tempdir().unwrap();
        let instance = installed_instance(dir.path());
        let url = server(
            zip_bytes(&[("nuevo.jar", "v2")]),
            zip_bytes(&[("config/a.toml", "v2"), ("config/sub/b.toml", "v2")]),
        ).await;

        update_with(Reporter::none(), dir.path(), &format!("{url}/overrides.zip"), &format!("{url}/mods.zip"), "pack", Some("2.0")).await.unwrap();

        assert!(!instance.join("mods").join("viejo.jar").exists());
        assert_eq!(std::fs::read_to_string(instance.join("mods").join("nuevo.jar")).unwrap(), "v2");
        assert_eq!(std::fs::read_to_string(instance.join("config").join("a.toml")).unwrap(), "v2");
        assert!(instance.join("config").join("sub").join("b.toml").exists());
        assert_eq!(std::fs::read_to_string(instance.join("options.txt")).unwrap(), "del jugador");
        assert_eq!(std::fs::read_to_string(instance.join(INSTALLED_VERSION_FILE)).unwrap(), "2.0");
        assert!(!instance.join(STAGING_DIR).exists());
    }

    #[tokio::test]
    async fn failed_update_leaves_the_instance_intact() {
        let dir = tempfile::tempdir().unwrap();
        let instance = installed_instance(dir.path());
        // overrides.zip no existe (404) y mods.zip está corrupto en otra pasada
        let url = server(zip_bytes(&[("nuevo.jar", "v2")]), b"esto no es un zip".to_vec()).await;

        for (mods, overrides) in [
            (format!("{url}/mods.zip"), format!("{url}/nada.zip")),
            (format!("{url}/mods.zip"), format!("{url}/overrides.zip")),
            (format!("{url}/overrides.zip"), format!("{url}/mods.zip")),
        ] {
            assert!(update_with(Reporter::none(), dir.path(), &overrides, &mods, "pack", Some("2.0")).await.is_err());
            assert_eq!(std::fs::read_to_string(instance.join("mods").join("viejo.jar")).unwrap(), "v1");
            assert_eq!(std::fs::read_to_string(instance.join("config").join("a.toml")).unwrap(), "v1");
            assert_eq!(std::fs::read_to_string(instance.join(INSTALLED_VERSION_FILE)).unwrap(), "1.0");
        }
    }

    #[test]
    fn failed_swap_restores_previous_mods() {
        let dir = tempfile::tempdir().unwrap();
        let instance = installed_instance(dir.path());
        // Sin staging/mods el cambio falla después de apartar los mods antiguos
        std::fs::create_dir_all(instance.join(STAGING_DIR)).unwrap();
        assert!(commit_content(&instance, "2.0").is_err());
        assert!(instance.join("mods").join("viejo.jar").exists());
        assert_eq!(std::fs::read_to_string(instance.join(INSTALLED_VERSION_FILE)).unwrap(), "1.0");
    }
}
