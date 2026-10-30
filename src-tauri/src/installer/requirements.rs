use std::path::{Path, PathBuf};

use anyhow::{anyhow, bail, Context, Result};
use serde_json::Value;
use sha2::{Digest, Sha256};
#[cfg(target_os = "windows")]
use crate::installer::extract;
use crate::installer::download;
use crate::installer::http;
use crate::installer::progress::{emit, ProgressPayload, Reporter};
use tracing::{info, warn};

const ADOPTIUM_ASSETS: &str = "https://api.adoptium.net/v3/assets/latest";

/// Versión de Java de los Minecraft antiguos o si no hay JSON de versión.
/// 1.20.5 ya necesita Java 21, no 17 como el resto de la 1.20; desde 2026
/// las versiones son `año.n` (26.1, 26.3...) y necesitan Java 25.
fn java_major_by_name(mc_version: &str) -> u32 {
    let mut parts = mc_version.split('.').map(|p| p.parse::<u32>().unwrap_or(0));
    let (major, minor, patch) = (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    );
    match (major, minor, patch) {
        (m, _, _) if m >= 26 => 25,
        (_, m, _) if m >= 21 => 21,
        (_, 20, p) if p >= 5 => 21,
        (_, m, _) if m >= 17 => 17,
        _ => 8,
    }
}

/// Versión de Java que pide el JSON de Mojang (o el del loader, si la indica)
pub fn required_java_major(mc_version: &str, jsons: &[&Value]) -> u32 {
    let declared = jsons
        .iter()
        .find_map(|json| json["javaVersion"]["majorVersion"].as_u64());
    match declared {
        // Java 16 no tiene soporte y la 17 ejecuta lo mismo (MC 1.17)
        Some(16) => 17,
        Some(major) => major as u32,
        None => java_major_by_name(mc_version),
    }
}

pub fn java_binary_path(launcher_root: &Path, major: u32) -> PathBuf {
    let binary = if cfg!(windows) { "java.exe" } else { "java" };
    launcher_root.join("java").join(major.to_string()).join("bin").join(binary)
}

/// Deja instalada esa versión de Java y devuelve su ejecutable
pub async fn ensure_java(major: u32, launcher_root: &Path, reporter: &Reporter) -> Result<PathBuf> {
    let binary = java_binary_path(launcher_root, major);
    if !binary.exists() {
        install_java(major, launcher_root, reporter)
            .await
            .with_context(|| format!("No se pudo instalar Java {}", major))?;
    }
    Ok(binary)
}

fn adoptium_os() -> &'static str {
    if cfg!(windows) { "windows" } else if cfg!(target_os = "macos") { "mac" } else { "linux" }
}

fn adoptium_arch() -> &'static str {
    if cfg!(target_arch = "aarch64") { "aarch64" } else { "x64" }
}

struct JavaPackage {
    url: String,
    sha256: Option<String>,
    filename: String,
}

fn parse_adoptium(assets: &Value) -> Option<JavaPackage> {
    let package = &assets.as_array()?.first()?["binary"]["package"];
    Some(JavaPackage {
        url: package["link"].as_str()?.to_string(),
        sha256: package["checksum"].as_str().map(String::from),
        filename: package["name"].as_str()?.to_string(),
    })
}

/// Último JRE de Temurin para esta versión, con su checksum
async fn latest_package(major: u32) -> Result<JavaPackage> {
    let url = format!(
        "{}/{}/hotspot?architecture={}&image_type=jre&os={}&vendor=eclipse",
        ADOPTIUM_ASSETS, major, adoptium_arch(), adoptium_os()
    );
    let assets: Value = http::get_json(&url).await?;
    parse_adoptium(&assets).ok_or_else(|| anyhow!("Adoptium no tiene Java {} para este sistema", major))
}

/// Reserva por si la API de Adoptium no responde (los binarios están en GitHub)
fn pinned_package(major: u32) -> Option<JavaPackage> {
    const BASE: &str = "https://github.com/adoptium";
    #[cfg(target_os = "windows")]
    let file = match major {
        25 => "temurin25-binaries/releases/download/jdk-25.0.5%2B8/OpenJDK25U-jre_x64_windows_hotspot_25.0.5_8.zip",
        21 => "temurin21-binaries/releases/download/jdk-21.0.13%2B9/OpenJDK21U-jre_x64_windows_hotspot_21.0.13_9.zip",
        17 => "temurin17-binaries/releases/download/jdk-17.0.20.1%2B1/OpenJDK17U-jre_x64_windows_hotspot_17.0.20.1_1.zip",
        8 => "temurin8-binaries/releases/download/jdk8u504-b01/OpenJDK8U-jre_x64_windows_hotspot_8u504b01.zip",
        _ => return None,
    };
    #[cfg(not(target_os = "windows"))]
    let file = match major {
        25 => "temurin25-binaries/releases/download/jdk-25.0.5%2B8/OpenJDK25U-jre_x64_linux_hotspot_25.0.5_8.tar.gz",
        21 => "temurin21-binaries/releases/download/jdk-21.0.13%2B9/OpenJDK21U-jre_x64_linux_hotspot_21.0.13_9.tar.gz",
        17 => "temurin17-binaries/releases/download/jdk-17.0.21%2B9/OpenJDK17U-jre_x64_linux_hotspot_17.0.21_9.tar.gz",
        8 => "temurin8-binaries/releases/download/jdk8u504-b01/OpenJDK8U-jre_x64_linux_hotspot_8u504b01.tar.gz",
        _ => return None,
    };
    if cfg!(not(any(target_os = "windows", target_os = "linux"))) || adoptium_arch() != "x64" {
        return None;
    }
    let filename = file.rsplit('/').next()?.to_string();
    Some(JavaPackage { url: format!("{}/{}", BASE, file), sha256: None, filename })
}

async fn sha256_of(path: &Path) -> Result<String> {
    let path = path.to_owned();
    tokio::task::spawn_blocking(move || -> Result<String> {
        let mut file = std::fs::File::open(path)?;
        let mut hasher = Sha256::new();
        std::io::copy(&mut file, &mut hasher)?;
        Ok(hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect())
    })
    .await?
}

/// El directorio extraído cambia con cada versión de Java (`jdk-21.0.13+9-jre`...)
fn find_java_home(extract_dir: &Path) -> Result<PathBuf> {
    let binary = if cfg!(windows) { "java.exe" } else { "java" };
    for entry in std::fs::read_dir(extract_dir)? {
        let dir = entry?.path();
        for home in [dir.clone(), dir.join("Contents").join("Home")] {
            if home.join("bin").join(binary).exists() {
                return Ok(home);
            }
        }
    }
    bail!("El paquete de Java no contiene bin/{}", binary)
}

async fn extract_package(archive: &Path, dest: &Path) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        extract::extract_zip(archive, dest, true, None, "").await
    }
    #[cfg(not(target_os = "windows"))]
    {
        let status = tokio::process::Command::new("tar")
            .arg("-xzf")
            .arg(archive)
            .arg("-C")
            .arg(dest)
            .kill_on_drop(true)
            .status()
            .await
            .context("No se pudo ejecutar tar")?;
        if !status.success() {
            bail!("tar terminó con {}", status);
        }
        Ok(())
    }
}

pub async fn install_java(major: u32, launcher_root: &Path, reporter: &Reporter) -> Result<()> {
    let java_root = launcher_root.join("java");
    tokio::fs::create_dir_all(&java_root).await?;

    let package = match latest_package(major).await {
        Ok(package) => package,
        Err(e) => {
            warn!("[java] API de Adoptium no disponible: {:#}", e);
            pinned_package(major).ok_or(e)?
        }
    };

    info!("[java] Descargando Java {} desde {}", major, package.url);
    let archive_path = java_root.join(&package.filename);
    let label = format!("Descargando Java {}...", major);
    download::download_resumable(&package.url, &archive_path, Some(reporter), &label).await?;

    if let Some(expected) = &package.sha256 {
        let actual = sha256_of(&archive_path).await?;
        if !actual.eq_ignore_ascii_case(expected) {
            tokio::fs::remove_file(&archive_path).await.ok();
            bail!("El checksum del paquete de Java no coincide");
        }
    }

    emit(reporter, ProgressPayload::Step { step: format!("Instalando Java {}...", major), percent: 100 });

    let temp_extract = java_root.join(format!("tmp_extract_{}", major));
    if temp_extract.exists() {
        tokio::fs::remove_dir_all(&temp_extract).await.ok();
    }
    tokio::fs::create_dir_all(&temp_extract).await?;

    let installed = async {
        extract_package(&archive_path, &temp_extract).await?;
        let home = find_java_home(&temp_extract)?;
        let final_dir = java_root.join(major.to_string());
        if final_dir.exists() {
            tokio::fs::remove_dir_all(&final_dir).await.ok();
        }
        tokio::fs::rename(&home, &final_dir).await?;
        anyhow::Ok(final_dir)
    }
    .await;

    tokio::fs::remove_file(&archive_path).await.ok();
    tokio::fs::remove_dir_all(&temp_extract).await.ok();

    let final_dir = installed?;
    info!("[java] Java {} instalado en {:?}", major, final_dir);
    Ok(())
}

/// Salida de `java -version`, para comprobar un Java instalado desde los tests
#[cfg(test)]
pub async fn java_version_output(binary: &Path) -> Result<String> {
    let output = tokio::process::Command::new(binary).arg("-version").output().await?;
    Ok(String::from_utf8_lossy(&output.stderr).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn java_version_by_name() {
        let by_name = |v| required_java_major(v, &[]);
        assert_eq!(by_name("1.16.5"), 8);
        assert_eq!(by_name("1.17.1"), 17);
        assert_eq!(by_name("1.18.2"), 17);
        assert_eq!(by_name("1.20.1"), 17);
        assert_eq!(by_name("1.20.4"), 17);
        assert_eq!(by_name("1.20.5"), 21);
        assert_eq!(by_name("1.21.1"), 21);
        assert_eq!(by_name("26.1"), 25);
        assert_eq!(by_name("26.3"), 25);
    }

    #[test]
    fn java_version_from_json_wins_over_the_name() {
        let json = json!({ "javaVersion": { "majorVersion": 25 } });
        assert_eq!(required_java_major("1.16.5", &[&json]), 25);
        let java16 = json!({ "javaVersion": { "majorVersion": 16 } });
        assert_eq!(required_java_major("1.17", &[&java16]), 17);
        // El loader va primero: si no la indica, se usa la de Minecraft
        assert_eq!(required_java_major("x", &[&json!({}), &json]), 25);
    }

    #[test]
    fn adoptium_response_is_parsed() {
        let assets = json!([{ "binary": { "package": { "link": "https://a/b.zip", "checksum": "ab", "name": "b.zip" } } }]);
        let package = parse_adoptium(&assets).unwrap();
        assert_eq!(package.url, "https://a/b.zip");
        assert_eq!(package.sha256.as_deref(), Some("ab"));
        assert!(parse_adoptium(&json!([])).is_none());
    }

    #[test]
    fn java_home_is_found_inside_the_versioned_folder() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("jdk-25.0.5+8-jre").join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join(if cfg!(windows) { "java.exe" } else { "java" }), "").unwrap();
        assert!(find_java_home(dir.path()).unwrap().ends_with("jdk-25.0.5+8-jre"));
    }
}
