use crate::installer::download;
use crate::installer::loaders::vanilla::{self, download_libraries};
use crate::installer::progress::{self, emit, ProgressPayload, Reporter};
use crate::process_ext::NoConsoleWindow;
use anyhow::{Context, Result};
use std::path::Path;
use tracing::{error, info};

/// Id de versión que genera el instalador de Forge
pub fn version_id(mc_version: &str, forge_version: &str) -> String {
    format!("{}-forge-{}", mc_version, forge_version)
}

/// Lo que cambia entre el instalador de Forge y el de NeoForge
pub struct LoaderInstaller<'a> {
    pub name: &'a str,
    pub url: String,
    /// Argumento que pide instalar el cliente
    pub client_flag: &'a str,
    /// Carpeta que crea dentro de `versions/`
    pub version_id: String,
}

pub async fn install(
    reporter: &Reporter,
    versions_dir: &Path,
    mc_version: &str,
    forge_version: &str,
) -> Result<()> {
    let installer = LoaderInstaller {
        name: "Forge",
        url: format!(
            "https://maven.minecraftforge.net/net/minecraftforge/forge/{mc}-{fv}/forge-{mc}-{fv}-installer.jar",
            mc = mc_version, fv = forge_version,
        ),
        client_flag: "--installClient",
        version_id: version_id(mc_version, forge_version),
    };
    run_installer(reporter, versions_dir, mc_version, installer).await
}

/// Minecraft vanilla, el instalador oficial del loader y las libraries que falten
pub async fn run_installer(
    reporter: &Reporter,
    versions_dir: &Path,
    mc_version: &str,
    installer: LoaderInstaller<'_>,
) -> Result<()> {
    let LoaderInstaller { name, url, client_flag, version_id } = installer;
    info!("[{}] Instalando {} sobre Minecraft {}", name, version_id, mc_version);

    let launcher_root = versions_dir
        .parent()
        .context("No se pudo determinar la raíz del launcher")?;

    let prepared = vanilla::prepare(reporter, versions_dir, mc_version, (0, 60)).await?;

    // El instalador se niega a funcionar sin este archivo
    let profiles_path = launcher_root.join("launcher_profiles.json");
    if !profiles_path.exists() {
        tokio::fs::write(&profiles_path, r#"{"profiles":{}}"#)
            .await
            .context("No se pudo crear launcher_profiles.json")?;
    }

    progress::sub_range(60, 70);
    let installer_path = download::download_to_temp_with_progress(
        reporter,
        &url,
        &format!("{}-installer.jar", name.to_lowercase()),
        &format!("Descargando {}...", name),
    )
    .await
    .with_context(|| format!("Error descargando el instalador de {}", name))?;

    // Sin progreso propio: se queda al inicio del tramo hasta que termine
    progress::sub_range(70, 90);
    emit(
        reporter,
        ProgressPayload::Step { step: format!("Ejecutando instalador de {}...", name), percent: 0 },
    );

    let output = tokio::process::Command::new(&prepared.java_bin)
        .arg("-jar")
        .arg(&installer_path)
        .arg(client_flag)
        .arg(launcher_root)
        // Si se cancela la instalación, matar también el instalador
        .kill_on_drop(true)
        .no_console_window()
        .current_dir(launcher_root)
        .output()
        .await
        .context("No se pudo ejecutar Java")?;

    tokio::fs::remove_file(&installer_path).await.ok();

    if !output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("[{}] El instalador falló con {:?}\nSTDOUT:\n{}\nSTDERR:\n{}", name, output.status.code(), stdout, stderr);
        anyhow::bail!(
            "El instalador de {} falló con código {:?}\nSTDOUT:\n{}\nSTDERR:\n{}",
            name, output.status.code(), stdout, stderr
        );
    }

    let json_path = versions_dir.join(&version_id).join(format!("{}.json", version_id));
    let loader_json: serde_json::Value = serde_json::from_str(
        &tokio::fs::read_to_string(&json_path)
            .await
            .with_context(|| format!("No se pudo leer el JSON de {}", name))?,
    )
    .with_context(|| format!("JSON de {} inválido", name))?;

    progress::sub_range(90, 100);
    download_libraries(&loader_json, launcher_root, reporter, &format!("Libraries {}", name))
        .await
        .with_context(|| format!("Fallo descargando libraries de {}", name))?;

    emit(
        reporter,
        ProgressPayload::Step { step: format!("{} instalado con éxito", name), percent: 100 },
    );
    info!("[{}] ✓ {} instalado", name, version_id);
    Ok(())
}
