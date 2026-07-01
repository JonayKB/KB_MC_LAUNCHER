use anyhow::{anyhow, Context, Result};
use tokio::process::Command;

fn get_min_java_version(minecraft_version: &str) -> &'static str {
    let version = if minecraft_version.starts_with("1.21")
        || minecraft_version == "1.20.5"
        || minecraft_version == "1.20.6"
    {
        "21"
    } else if minecraft_version.starts_with("1.20")
        || minecraft_version.starts_with("1.19")
        || minecraft_version.starts_with("1.18")
    {
        "17"
    } else if minecraft_version.starts_with("1.17") {
        "16"
    } else {
        "8"
    };

    log::debug!(
        "[requirements::get_min_java_version] MC {} → Java {}+",
        minecraft_version, version
    );
    version
}

async fn has_java_version(min_version: &str) -> Result<bool> {
    log::debug!("[requirements::has_java_version] Comprobando Java {}+...", min_version);

    let output = match Command::new("java").arg("-version").output().await {
        Ok(out) => out,
        Err(e) => {
            log::warn!("[requirements::has_java_version] Java no encontrado en PATH: {}", e);
            return Ok(false);
        }
    };

    if output.stderr.is_empty() && output.stdout.is_empty() {
        log::warn!("[requirements::has_java_version] java -version no devolvió salida");
        return Ok(false);
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let version_line = stderr.lines().next().unwrap_or("");
    log::debug!("[requirements::has_java_version] version line: {}", version_line);

    let raw_version = version_line
        .split_whitespace()
        .nth(2)
        .unwrap_or("")
        .trim_matches('"');

    let cleaned_version = if raw_version.starts_with("1.") {
        &raw_version[2..]
    } else {
        raw_version
    };

    let system_major: u32 = cleaned_version
        .split(&['.', '_', '-'][..])
        .next()
        .unwrap_or("")
        .parse()
        .unwrap_or(0);

    let required_major: u32 = min_version.parse().unwrap_or(0);
    let ok = system_major >= required_major;

    log::info!(
        "[requirements::has_java_version] Java detectado: {} (major {}) — requerido: {} — {}",
        raw_version,
        system_major,
        required_major,
        if ok { "OK ✓" } else { "INSUFICIENTE ✗" }
    );

    Ok(ok)
}

#[cfg(target_os = "windows")]
pub async fn install_java(min_version: &str) -> Result<()> {
    let package_id = match min_version {
        "21" => "Eclipse.Temurin.21.JRE",
        "17" => "Eclipse.Temurin.17.JRE",
        "16" => "Eclipse.Temurin.16.JRE",
        "8"  => "Eclipse.Temurin.8.JRE",
        _ => return Err(anyhow!(
            "Versión Java no soportada para instalación automática: {}",
            min_version
        )),
    };

    log::info!("[requirements::install_java] Instalando {} via winget...", package_id);

    let install_status = Command::new("winget")
        .args([
            "install", "--id", package_id,
            "--silent",
            "--accept-source-agreements",
            "--accept-package-agreements",
        ])
        .status()
        .await
        .context("Error ejecutando winget")?;

    if install_status.success() {
        log::info!("[requirements::install_java] {} instalado correctamente", package_id);
        Ok(())
    } else {
        log::error!("[requirements::install_java] winget falló para {}", package_id);
        Err(anyhow!("Winget failed to install package: {}", package_id))
    }
}

#[cfg(target_os = "linux")]
pub async fn install_java(min_version: &str) -> Result<()> {
    log::info!("[requirements::install_java] Detectando gestor de paquetes...");

    let has_apt    = which("apt-get").await;
    let has_dnf    = which("dnf").await;
    let has_pacman = which("pacman").await;

    log::debug!(
        "[requirements::install_java] apt-get: {} | dnf: {} | pacman: {}",
        has_apt, has_dnf, has_pacman
    );

    let status = if has_apt {
        let package_name = match min_version {
            "21" => "openjdk-21-jre",
            "17" => "openjdk-17-jre",
            "16" => "openjdk-16-jre",
            "8"  => "openjdk-8-jre",
            _ => return Err(anyhow!("Versión Java no soportada: {}", min_version)),
        };
        log::info!("[requirements::install_java] apt-get install -y {}", package_name);
        Command::new("pkexec")
            .args(["apt-get", "install", "-y", package_name])
            .status().await
            .context("Error ejecutando apt-get")?
    } else if has_dnf {
        let package_name = match min_version {
            "21" => "java-21-openjdk",
            "17" => "java-17-openjdk",
            "16" => "java-16-openjdk",
            "8"  => "java-1.8.0-openjdk",
            _ => return Err(anyhow!("Versión Java no soportada: {}", min_version)),
        };
        log::info!("[requirements::install_java] dnf install -y {}", package_name);
        Command::new("pkexec")
            .args(["dnf", "install", "-y", package_name])
            .status().await
            .context("Error ejecutando dnf")?
    } else if has_pacman {
        log::info!("[requirements::install_java] pacman -S --noconfirm jre-openjdk");
        Command::new("pkexec")
            .args(["pacman", "-S", "--noconfirm", "jre-openjdk"])
            .status().await
            .context("Error ejecutando pacman")?
    } else {
        log::error!("[requirements::install_java] No se encontró gestor de paquetes compatible");
        return Err(anyhow!(
            "No se encontró gestor de paquetes compatible (apt, dnf, pacman). Instala Java {} manualmente.",
            min_version
        ));
    };

    if status.success() {
        log::info!("[requirements::install_java] Java {} instalado correctamente", min_version);
        Ok(())
    } else {
        log::error!("[requirements::install_java] Falló la instalación de Java {}", min_version);
        Err(anyhow!("Falló la instalación de Java {}", min_version))
    }
}

#[cfg(target_os = "macos")]
pub async fn install_java(min_version: &str) -> Result<()> {
    log::info!("[requirements::install_java] macOS — comprobando Homebrew...");

    let has_brew = which("brew").await;
    if !has_brew {
        log::error!("[requirements::install_java] Homebrew no encontrado");
        return Err(anyhow!(
            "Homebrew no está instalado. Instala Java {} manualmente desde https://adoptium.net",
            min_version
        ));
    }

    let cask = match min_version {
        "21" => "temurin@21",
        "17" => "temurin@17",
        "8"  => "temurin@8",
        _    => "temurin@17",
    };

    log::info!("[requirements::install_java] brew install --cask {}", cask);

    let status = Command::new("brew")
        .args(["install", "--cask", cask])
        .status().await
        .context("Error ejecutando brew")?;

    if status.success() {
        log::info!("[requirements::install_java] {} instalado correctamente", cask);
        Ok(())
    } else {
        log::error!("[requirements::install_java] Falló brew install {}", cask);
        Err(anyhow!("Falló brew install {}", cask))
    }
}

async fn which(cmd: &str) -> bool {
    let found = Command::new("which")
        .arg(cmd)
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false);

    log::trace!("[requirements::which] {} → {}", cmd, if found { "encontrado" } else { "no encontrado" });
    found
}

pub async fn check_java_by_minecraft_version(minecraft_version: &str) -> Result<bool> {
    log::info!(
        "[requirements::check_java_by_minecraft_version] Comprobando Java para MC {}",
        minecraft_version
    );
    let min_version = get_min_java_version(minecraft_version);
    let result = has_java_version(min_version).await;
    log::debug!(
        "[requirements::check_java_by_minecraft_version] Resultado: {:?}",
        result
    );
    result
}

pub async fn install_java_by_minecraft_version(minecraft_version: &str) -> Result<()> {
    log::info!(
        "[requirements::install_java_by_minecraft_version] Instalando Java para MC {}",
        minecraft_version
    );
    let min_version = get_min_java_version(minecraft_version);
    let result = install_java(min_version).await;
    match &result {
        Ok(_) => log::info!(
            "[requirements::install_java_by_minecraft_version] Java {} instalado OK",
            min_version
        ),
        Err(e) => log::error!(
            "[requirements::install_java_by_minecraft_version] Error: {:#}",
            e
        ),
    }
    result
}

pub fn get_java_binary(launcher_root: &std::path::Path) -> String {
    let local = if cfg!(windows) {
        launcher_root.join("java/jdk-17.0.11+9/bin/java.exe")
    } else {
        launcher_root.join("java/bin/java")
    };

    if local.exists() {
        let path = local.to_string_lossy().to_string();
        log::info!("[requirements::get_java_binary] Usando Java del launcher: {}", path);
        return path;
    }

    let system = if cfg!(windows) { "java.exe" } else { "java" };
    log::info!("[requirements::get_java_binary] Usando Java del sistema: {}", system);
    system.to_string()
}