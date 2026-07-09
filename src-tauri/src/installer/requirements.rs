use std::path::Path;

use anyhow::{anyhow, Result};
use tokio::process::Command;
use tracing::{error, info};

fn get_required_java_version(mc_version: &str) -> &'static str {
    match mc_version {
        v if v.starts_with("1.21") => "21",
        v if v.starts_with("1.20") => "17",
        v if v.starts_with("1.19") => "17",
        v if v.starts_with("1.18") => "17",
        _ => "8",
    }
}

pub async fn install_java(version: &str, launcher_root: &Path) -> Result<()> {
    let java_root = launcher_root.join("java");
    tokio::fs::create_dir_all(&java_root).await?;

    #[cfg(target_os = "windows")]
    let (url, extracted_dir, archive_name) = match version {
        "21" => (
            "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.3%2B9/OpenJDK21U-jre_x64_windows_hotspot_21.0.3_9.zip",
            "jdk-21.0.3+9-jre",
            "java21.zip",
        ),
        "17" => (
            "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.11%2B9/OpenJDK17U-jre_x64_windows_hotspot_17.0.11_9.zip",
            "jdk-17.0.11+9-jre",
            "java17.zip",
        ),
        "8" => (
            "https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u412-b08/OpenJDK8U-jre_x64_windows_hotspot_8u412b08.zip",
            "jdk8u412-b08-jre",
            "java8.zip",
        ),
        _ => return Err(anyhow!("Versión Java no soportada: {}", version)),
    };

    #[cfg(target_os = "linux")]
    let (url, extracted_dir, archive_name) = match version {
        "21" => (
            "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.3%2B9/OpenJDK21U-jre_x64_linux_hotspot_21.0.3_9.tar.gz",
            "jdk-21.0.3+9-jre",
            "java21.tar.gz",
        ),
        "17" => (
            "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.11%2B9/OpenJDK17U-jre_x64_linux_hotspot_17.0.11_9.tar.gz",
            "jdk-17.0.11+9-jre",
            "java17.tar.gz",
        ),
        "8" => (
            "https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u412-b08/OpenJDK8U-jre_x64_linux_hotspot_8u412b08.tar.gz",
            "jdk8u412-b08-jre",
            "java8.tar.gz",
        ),
        _ => return Err(anyhow!("Versión Java no soportada: {}", version)),
    };

    let archive_path = java_root.join(archive_name);

    info!("Descargando Java {}...", version);

    let response = reqwest::get(url).await?.error_for_status()?;

    let bytes = response.bytes().await?;

    tokio::fs::write(&archive_path, &bytes).await?;

    let temp_extract = java_root.join("tmp_extract");

    if temp_extract.exists() {
        tokio::fs::remove_dir_all(&temp_extract).await.ok();
    }

    tokio::fs::create_dir_all(&temp_extract).await?;

    #[cfg(target_os = "windows")]
    {
        let status = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &format!(
                    "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
                    archive_path.display(),
                    temp_extract.display()
                ),
            ])
            .status()
            .await?;

        if !status.success() {
            return Err(anyhow!("No se pudo extraer Java"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        let status = Command::new("tar")
            .args([
                "-xzf",
                archive_path.to_str().unwrap(),
                "-C",
                temp_extract.to_str().unwrap(),
            ])
            .status()
            .await?;

        if !status.success() {
            return Err(anyhow!("No se pudo extraer Java"));
        }
    }

    let extracted = temp_extract.join(extracted_dir);

    let final_dir = java_root.join(version);

    if final_dir.exists() {
        tokio::fs::remove_dir_all(&final_dir).await.ok();
    }

    tokio::fs::rename(&extracted, &final_dir).await?;

    tokio::fs::remove_file(&archive_path).await.ok();
    tokio::fs::remove_dir_all(&temp_extract).await.ok();

    let java_bin = if cfg!(windows) {
        final_dir.join("bin").join("java.exe")
    } else {
        final_dir.join("bin").join("java")
    };

    if !java_bin.exists() {
        return Err(anyhow!(
            "Java {} extraído pero no se encontró bin/java",
            version
        ));
    }

    info!("Java {} instalado en {:?}", version, final_dir);

    Ok(())
}


pub async fn check_java_by_minecraft_version(mc_version: &str, launcher_root: &Path) -> bool {
    let version = get_required_java_version(mc_version);

    let java = if cfg!(windows) {
        launcher_root
            .join("java")
            .join(version)
            .join("bin")
            .join("java.exe")
    } else {
        launcher_root
            .join("java")
            .join(version)
            .join("bin")
            .join("java")
    };

    java.exists()
}
pub async fn install_java_by_minecraft_version(
    minecraft_version: &str,
    launcher_root: &Path,
) -> Result<()> {
    info!(
        "[requirements::install_java_by_minecraft_version] Instalando Java para MC {}",
        minecraft_version
    );
    let min_version = get_required_java_version(minecraft_version);
    let result = install_java(min_version, launcher_root).await;
    match &result {
        Ok(_) => info!(
            "[requirements::install_java_by_minecraft_version] Java {} instalado OK",
            min_version
        ),
        Err(e) => error!(
            "[requirements::install_java_by_minecraft_version] Error: {:#}",
            e
        ),
    }
    result
}

pub async fn get_java_binary_async(launcher_root: &Path, mc_version: &str) -> String {
    let java_version = get_required_java_version(mc_version);

    let local = if cfg!(windows) {
        launcher_root
            .join("java")
            .join(java_version)
            .join("bin")
            .join("java.exe")
    } else {
        launcher_root
            .join("java")
            .join(java_version)
            .join("bin")
            .join("java")
    };

    if local.exists() {
        return local.to_string_lossy().to_string();
    }

    panic!("Java {} no instalado en el launcher", java_version);
}
