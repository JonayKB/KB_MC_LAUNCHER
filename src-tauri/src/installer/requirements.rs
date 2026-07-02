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
        minecraft_version,
        version
    );
    version
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

#[cfg(target_os = "windows")]
pub async fn install_java(min_version: &str) -> Result<()> {
    let package_id = match min_version {
        "21" => "Eclipse.Temurin.21.JRE",
        "17" => "Eclipse.Temurin.17.JRE",
        "16" => "Eclipse.Temurin.16.JRE",
        "8" => "Eclipse.Temurin.8.JRE",
        _ => {
            return Err(anyhow!(
                "Versión Java no soportada para instalación automática: {}",
                min_version
            ))
        }
    };

    // Comprobar si winget existe
    let winget_available = Command::new("winget")
        .arg("--version")
        .output()
        .await
        .map(|o| {
            let v = String::from_utf8_lossy(&o.stdout).to_string();
            log::info!("[requirements::install_java] winget version: {}", v.trim());
            o.status.success()
        })
        .unwrap_or(false);

    if !winget_available {
        log::warn!("[requirements::install_java] winget no disponible, usando descarga directa");
        return install_java_direct(min_version).await;
    }

    log::info!(
        "[requirements::install_java] Instalando {} via winget...",
        package_id
    );

    let output = Command::new("winget")
        .args([
            "install",
            "--id",
            package_id,
            "--silent",
            "--accept-source-agreements",
            "--accept-package-agreements",
            "--scope",
            "user", // instalar solo para el usuario actual, no requiere admin
        ])
        .output()
        .await
        .context("Error ejecutando winget")?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    log::debug!("[requirements::install_java] winget stdout:\n{}", stdout);
    log::debug!("[requirements::install_java] winget stderr:\n{}", stderr);
    log::debug!(
        "[requirements::install_java] winget exit code: {:?}",
        output.status.code()
    );

    if output.status.success() {
        log::info!(
            "[requirements::install_java] {} instalado correctamente via winget",
            package_id
        );
        Ok(())
    } else {
        log::warn!("[requirements::install_java] winget falló (código {:?}), intentando descarga directa...", output.status.code());
        install_java_direct(min_version).await
    }
}

// Fallback: descarga directa del MSI de Adoptium
#[cfg(target_os = "windows")]
async fn install_java_direct(min_version: &str) -> Result<()> {
    log::info!(
        "[requirements::install_java_direct] Descargando Java {} directamente...",
        min_version
    );

    let (url, filename) = match min_version {
        "21" => (
            "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.3%2B9/OpenJDK21U-jre_x64_windows_hotspot_21.0.3_9.msi",
            "java21-installer.msi"
        ),
        "17" => (
            "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.11%2B9/OpenJDK17U-jre_x64_windows_hotspot_17.0.11_9.msi",
            "java17-installer.msi"
        ),
        "8" => (
            "https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u412-b08/OpenJDK8U-jre_x64_windows_hotspot_8u412b08.msi",
            "java8-installer.msi"
        ),
        _ => return Err(anyhow!("Versión Java no soportada: {}", min_version)),
    };

    let tmp = std::env::temp_dir().join(filename);
    log::info!(
        "[requirements::install_java_direct] Descargando desde: {}",
        url
    );

    let response = reqwest::get(url)
        .await
        .context("Error descargando Java")?
        .error_for_status()
        .context("El servidor devolvió error")?;

    let bytes = response.bytes().await.context("Error leyendo descarga")?;
    tokio::fs::write(&tmp, &bytes)
        .await
        .context("Error guardando instalador")?;

    log::info!(
        "[requirements::install_java_direct] Instalador guardado en {:?}",
        tmp
    );
    log::info!("[requirements::install_java_direct] Ejecutando MSI silencioso...");

    // /quiet = sin UI, /norestart = no reiniciar
    let output = Command::new("msiexec")
        .args([
            "/i",
            tmp.to_str().unwrap(),
            "/quiet",
            "/norestart",
            "ADDLOCAL=FeatureMain",
        ])
        .output()
        .await
        .context("Error ejecutando msiexec")?;

    tokio::fs::remove_file(&tmp).await.ok();

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    log::debug!(
        "[requirements::install_java_direct] msiexec stdout: {}",
        stdout
    );
    log::debug!(
        "[requirements::install_java_direct] msiexec stderr: {}",
        stderr
    );
    log::debug!(
        "[requirements::install_java_direct] msiexec exit code: {:?}",
        output.status.code()
    );

    // msiexec devuelve 0 o 3010 (éxito, requiere reinicio) como códigos de éxito
    let code = output.status.code().unwrap_or(-1);
    if code == 0 || code == 3010 {
        if code == 3010 {
            log::warn!("[requirements::install_java_direct] Java instalado pero requiere reinicio del sistema");
        } else {
            log::info!(
                "[requirements::install_java_direct] Java {} instalado correctamente via MSI",
                min_version
            );
        }
        Ok(())
    } else {
        log::error!(
            "[requirements::install_java_direct] msiexec falló con código {}",
            code
        );
        Err(anyhow!(
            "No se pudo instalar Java {}. Instálalo manualmente desde https://adoptium.net (código {})",
            min_version, code
        ))
    }
}

#[cfg(target_os = "linux")]
pub async fn install_java(min_version: &str) -> Result<()> {
    log::info!("[requirements::install_java] Detectando gestor de paquetes...");

    let has_apt = which("apt-get").await;
    let has_dnf = which("dnf").await;
    let has_pacman = which("pacman").await;

    log::debug!(
        "[requirements::install_java] apt-get: {} | dnf: {} | pacman: {}",
        has_apt,
        has_dnf,
        has_pacman
    );

    let status = if has_apt {
        let package_name = match min_version {
            "21" => "openjdk-21-jre",
            "17" => "openjdk-17-jre",
            "16" => "openjdk-16-jre",
            "8" => "openjdk-8-jre",
            _ => return Err(anyhow!("Versión Java no soportada: {}", min_version)),
        };
        log::info!(
            "[requirements::install_java] apt-get install -y {}",
            package_name
        );
        Command::new("pkexec")
            .args(["apt-get", "install", "-y", package_name])
            .status()
            .await
            .context("Error ejecutando apt-get")?
    } else if has_dnf {
        let package_name = match min_version {
            "21" => "java-21-openjdk",
            "17" => "java-17-openjdk",
            "16" => "java-16-openjdk",
            "8" => "java-1.8.0-openjdk",
            _ => return Err(anyhow!("Versión Java no soportada: {}", min_version)),
        };
        log::info!(
            "[requirements::install_java] dnf install -y {}",
            package_name
        );
        Command::new("pkexec")
            .args(["dnf", "install", "-y", package_name])
            .status()
            .await
            .context("Error ejecutando dnf")?
    } else if has_pacman {
        log::info!("[requirements::install_java] pacman -S --noconfirm jre-openjdk");
        Command::new("pkexec")
            .args(["pacman", "-S", "--noconfirm", "jre-openjdk"])
            .status()
            .await
            .context("Error ejecutando pacman")?
    } else {
        log::error!("[requirements::install_java] No se encontró gestor de paquetes compatible");
        return Err(anyhow!(
            "No se encontró gestor de paquetes compatible (apt, dnf, pacman). Instala Java {} manualmente.",
            min_version
        ));
    };

    if status.success() {
        log::info!(
            "[requirements::install_java] Java {} instalado correctamente",
            min_version
        );
        Ok(())
    } else {
        log::error!(
            "[requirements::install_java] Falló la instalación de Java {}",
            min_version
        );
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
        "8" => "temurin@8",
        _ => "temurin@17",
    };

    log::info!("[requirements::install_java] brew install --cask {}", cask);

    let status = Command::new("brew")
        .args(["install", "--cask", cask])
        .status()
        .await
        .context("Error ejecutando brew")?;

    if status.success() {
        log::info!(
            "[requirements::install_java] {} instalado correctamente",
            cask
        );
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

    log::trace!(
        "[requirements::which] {} → {}",
        cmd,
        if found { "encontrado" } else { "no encontrado" }
    );
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
    // 1. Java propio del launcher
    let local = if cfg!(windows) {
        launcher_root.join("java/jdk-17.0.11+9/bin/java.exe")
    } else {
        launcher_root.join("java/bin/java")
    };

    if local.exists() {
        let path = local.to_string_lossy().to_string();
        log::info!(
            "[requirements::get_java_binary] Usando Java del launcher: {}",
            path
        );
        return path;
    }

    // 2. Java del sistema (PATH)
    let system = if cfg!(windows) { "java.exe" } else { "java" };
    log::info!(
        "[requirements::get_java_binary] Usando Java del sistema: {}",
        system
    );
    system.to_string()
}
pub async fn get_java_binary_async(launcher_root: &std::path::Path) -> String {
    // 1. Java propio del launcher
    let local = if cfg!(windows) {
        launcher_root.join("java/jdk-17.0.11+9/bin/java.exe")
    } else {
        launcher_root.join("java/bin/java")
    };

    if local.exists() {
        let path = local.to_string_lossy().to_string();
        log::info!(
            "[requirements::get_java_binary_async] Usando Java del launcher: {}",
            path
        );
        return path;
    }

    // 2. Buscar en todo el sistema
    if let Some(found) = find_java_in_system().await {
        return found;
    }

    // 3. Fallback al PATH
    let system = if cfg!(windows) { "java.exe" } else { "java" };
    log::warn!(
        "[requirements::get_java_binary_async] Fallback a PATH: {}",
        system
    );
    system.to_string()
}
