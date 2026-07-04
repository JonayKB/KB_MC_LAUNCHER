use std::path::Path;

use anyhow::{anyhow, Context, Result};
use tokio::process::Command;
async fn find_java_in_system() -> Option<String> {
    // 1. Intentar PATH primero
    let in_path = Command::new("java")
        .arg("-version")
        .output()
        .await
        .map(|o| !o.stderr.is_empty() || !o.stdout.is_empty())
        .unwrap_or(false);

    if in_path {
        log::info!("[requirements::find_java_in_system] Java encontrado en PATH");
        return Some("java".to_string());
    }

    log::debug!(
        "[requirements::find_java_in_system] Java no en PATH, buscando en ubicaciones conocidas..."
    );

    // 2. Ubicaciones típicas según OS
    #[cfg(target_os = "windows")]
    let candidates: Vec<std::path::PathBuf> = {
        let mut paths = Vec::new();

        // Program Files
        for base in [
            std::env::var("ProgramFiles").unwrap_or("C:\\Program Files".into()),
            std::env::var("ProgramFiles(x86)").unwrap_or("C:\\Program Files (x86)".into()),
            std::env::var("LOCALAPPDATA")
                .map(|p| format!("{}\\Programs", p))
                .unwrap_or_default(),
        ] {
            if base.is_empty() {
                continue;
            }
            for vendor in [
                "Eclipse Adoptium",
                "Java",
                "Microsoft",
                "BellSoft",
                "Amazon Corretto",
                "Zulu",
            ] {
                let vendor_dir = std::path::Path::new(&base).join(vendor);
                if let Ok(entries) = std::fs::read_dir(&vendor_dir) {
                    for entry in entries.flatten() {
                        let java_bin = entry.path().join("bin").join("java.exe");
                        if java_bin.exists() {
                            paths.push(java_bin);
                        }
                        // JRE dentro de JDK
                        let jre_bin = entry.path().join("jre").join("bin").join("java.exe");
                        if jre_bin.exists() {
                            paths.push(jre_bin);
                        }
                    }
                }
            }
        }

        // Registro de Windows: HKLM\SOFTWARE\JavaSoft
        // No usamos el registro directamente para no añadir dependencias,
        // pero sí buscamos rutas comunes del JRE registrado
        paths.push(std::path::PathBuf::from(
            "C:\\Program Files\\Java\\jre1.8.0_392\\bin\\java.exe",
        ));
        paths.push(std::path::PathBuf::from(
            "C:\\Program Files\\Java\\jre-1.8\\bin\\java.exe",
        ));

        paths
    };

    #[cfg(target_os = "linux")]
    let candidates: Vec<std::path::PathBuf> = {
        let mut paths = Vec::new();
        for base in ["/usr/lib/jvm", "/usr/java", "/opt/java", "/opt/jdk"] {
            if let Ok(entries) = std::fs::read_dir(base) {
                for entry in entries.flatten() {
                    let bin = entry.path().join("bin/java");
                    if bin.exists() {
                        paths.push(bin);
                    }
                    let bin2 = entry.path().join("jre/bin/java");
                    if bin2.exists() {
                        paths.push(bin2);
                    }
                }
            }
        }
        // update-alternatives
        let alt = std::path::PathBuf::from("/etc/alternatives/java");
        if alt.exists() {
            paths.push(alt);
        }
        paths
    };

    #[cfg(target_os = "macos")]
    let candidates: Vec<std::path::PathBuf> = {
        let mut paths = Vec::new();
        for base in [
            "/Library/Java/JavaVirtualMachines",
            "/System/Library/Java/JavaVirtualMachines",
        ] {
            if let Ok(entries) = std::fs::read_dir(base) {
                for entry in entries.flatten() {
                    let bin = entry.path().join("Contents/Home/bin/java");
                    if bin.exists() {
                        paths.push(bin);
                    }
                }
            }
        }
        // java_home helper
        if let Ok(out) = Command::new("/usr/libexec/java_home").output().await {
            let home = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !home.is_empty() {
                paths.push(std::path::PathBuf::from(home).join("bin/java"));
            }
        }
        paths
    };

    // 3. Probar cada candidato
    for candidate in candidates {
        if !candidate.exists() {
            continue;
        }
        log::debug!(
            "[requirements::find_java_in_system] Probando: {:?}",
            candidate
        );
        let result = Command::new(&candidate).arg("-version").output().await;
        match result {
            Ok(out) if !out.stderr.is_empty() || !out.stdout.is_empty() => {
                let path_str = candidate.to_string_lossy().to_string();
                log::info!(
                    "[requirements::find_java_in_system] Java encontrado en: {}",
                    path_str
                );
                return Some(path_str);
            }
            _ => continue,
        }
    }

    log::warn!(
        "[requirements::find_java_in_system] Java no encontrado en ninguna ubicación conocida"
    );
    None
}
fn get_required_java_version(mc_version: &str) -> &'static str {
    match mc_version {
        v if v.starts_with("1.21") => "21",
        v if v.starts_with("1.20") => "17",
        v if v.starts_with("1.19") => "17",
        v if v.starts_with("1.18") => "17",
        _ => "8",
    }
}

async fn has_java_version(min_version: &str) -> Result<bool> {
    log::debug!(
        "[requirements::has_java_version] Comprobando Java {}+...",
        min_version
    );

    let java_bin = match find_java_in_system().await {
        Some(bin) => bin,
        None => {
            log::warn!("[requirements::has_java_version] Java no encontrado en el sistema");
            return Ok(false);
        }
    };

    let output = match Command::new(&java_bin).arg("-version").output().await {
        Ok(out) => out,
        Err(e) => {
            log::warn!(
                "[requirements::has_java_version] Error ejecutando {}: {}",
                java_bin,
                e
            );
            return Ok(false);
        }
    };

    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    );

    log::debug!(
        "[requirements::has_java_version] Salida:\n{}",
        combined.trim()
    );

    let version_num = combined
        .lines()
        .find_map(|line| line.split('"').nth(1))
        .unwrap_or("");

    if version_num.is_empty() {
        log::warn!("[requirements::has_java_version] No se pudo extraer versión");
        return Ok(false);
    }

    let major_str = if version_num.starts_with("1.") {
        version_num.split('.').nth(1).unwrap_or("0")
    } else {
        version_num.split('.').next().unwrap_or("0")
    };

    let system_major: u32 = major_str
        .split(&['-', '_', '+'][..])
        .next()
        .unwrap_or("0")
        .parse()
        .unwrap_or(0);

    let required_major: u32 = min_version.parse().unwrap_or(0);
    let ok = system_major >= required_major;

    log::info!(
        "[requirements::has_java_version] Java: {} (major {}) — requerido: {} — {}",
        version_num,
        system_major,
        required_major,
        if ok { "OK ✓" } else { "INSUFICIENTE ✗" }
    );

    Ok(ok)
}

pub async fn install_java(
    version: &str,
    launcher_root: &Path,
) -> Result<()> {
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

    log::info!("Descargando Java {}...", version);

    let response = reqwest::get(url)
        .await?
        .error_for_status()?;

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

    log::info!("Java {} instalado en {:?}", version, final_dir);

    Ok(())
}


async fn which(cmd: &str) -> bool {
    let found = Command::new("which")
        .arg(cmd)
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false);

    log::trace!(
        "[requirements::which] {} → {}",
        cmd,
        if found { "encontrado" } else { "no encontrado" }
    );
    found
}

pub async fn check_java_by_minecraft_version(
    mc_version: &str,
    launcher_root: &Path,
) -> bool {
    let version =
        get_required_java_version(mc_version);

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
pub async fn install_java_by_minecraft_version(minecraft_version: &str, launcher_root: &Path) -> Result<()> {
    log::info!(
        "[requirements::install_java_by_minecraft_version] Instalando Java para MC {}",
        minecraft_version
    );
    let min_version = get_required_java_version(minecraft_version);
    let result = install_java(min_version,launcher_root).await;
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

pub async fn get_java_binary_async(
    launcher_root: &Path,
    mc_version: &str,
) -> String {
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

    panic!(
        "Java {} no instalado en el launcher",
        java_version
    );
}