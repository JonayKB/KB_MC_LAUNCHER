use crate::installer::loaders::fabric;
use crate::installer::requirements::get_java_binary_async;
use crate::RunningInstances;
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};
use tracing::{debug, error, info, warn};
pub struct LaunchSettings {
    pub min_ram_mb: u32,
    pub max_ram_mb: u32,
    pub fullscreen: bool,
    pub window_width: u32,
    pub window_height: u32,
    pub extra_jvm_args: String,
}
/// Datos de sesión con los que se lanza el juego
pub struct LaunchAuth {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub user_type: &'static str,
}

impl LaunchAuth {
    /// Cuenta Microsoft (online) si hay uuid y token; si no, cuenta offline
    pub fn new(username: String, uuid: Option<String>, access_token: Option<String>) -> Self {
        match (uuid, access_token) {
            (Some(uuid), Some(access_token)) if !uuid.is_empty() && !access_token.is_empty() => {
                Self {
                    username,
                    uuid,
                    access_token,
                    user_type: "msa",
                }
            }
            _ => Self {
                uuid: offline_uuid(&username),
                username,
                access_token: "0".to_string(),
                user_type: "legacy",
            },
        }
    }
}

/// UUID offline igual que el cliente vanilla:
/// `UUID.nameUUIDFromBytes("OfflinePlayer:<nombre>")` (MD5, versión 3)
pub fn offline_uuid(username: &str) -> String {
    use md5::{Digest, Md5};
    let mut bytes: [u8; 16] = Md5::digest(format!("OfflinePlayer:{}", username).as_bytes()).into();
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

impl Default for LaunchSettings {
    fn default() -> Self {
        Self {
            min_ram_mb: 512,
            max_ram_mb: 4096,
            fullscreen: false,
            window_width: 1280,
            window_height: 720,
            extra_jvm_args: String::new(),
        }
    }
}
#[cfg(target_os = "windows")]
fn set_gpu_preference_high_performance(exe_path: &str) {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    match hkcu.create_subkey("Software\\Microsoft\\DirectX\\UserGpuPreferences") {
        Ok((key, _)) => {
            if let Err(e) = key.set_value(exe_path, &"GpuPreference=2;") {
                warn!("[launcher] No se pudo fijar preferencia de GPU: {}", e);
            } else {
                info!(
                    "[launcher] GPU de alto rendimiento fijada para: {}",
                    exe_path
                );
            }
        }
        Err(e) => warn!("[launcher] No se pudo abrir UserGpuPreferences: {}", e),
    }
}

#[cfg(not(target_os = "windows"))]
fn set_gpu_preference_high_performance(_exe_path: &str) {}

pub async fn launch(
    app: AppHandle,
    base_path: String,
    modpack_id: String,
    mc_version: String,
    loader: String,
    loader_version: String,
    auth: LaunchAuth,
    settings: LaunchSettings,
) -> Result<()> {
    let username = auth.username.clone();
    let base = Path::new(&base_path);
    let instance_dir = base.join("instances").join(&modpack_id);
    let versions_dir = base.join("versions");
    let libs_dir = base.join("libraries");

    let java_bin = get_java_binary_async(base, &mc_version).await;
    info!("[launcher::launch] Usando Java: {}", java_bin);
    info!(
        "[launcher::launch] RAM: {}MB - {}MB | Fullscreen: {} | {}x{}",
        settings.min_ram_mb,
        settings.max_ram_mb,
        settings.fullscreen,
        settings.window_width,
        settings.window_height
    );
    set_gpu_preference_high_performance(&java_bin);

    let version_id = match loader.as_str() {
        "forge" => format!("{}-forge-{}", mc_version, loader_version),
        "fabric" => fabric::version_id(&mc_version, &loader_version),
        other => anyhow::bail!("El loader '{}' todavía no está soportado", other),
    };
    let loader_json_path = versions_dir
        .join(&version_id)
        .join(format!("{}.json", version_id));

    let loader_json_str = tokio::fs::read_to_string(&loader_json_path)
        .await
        .context("No se pudo leer el JSON del loader. ¿Está instalado el modpack?")?;
    let loader_json: serde_json::Value =
        serde_json::from_str(&loader_json_str).context("JSON del loader inválido")?;

    let mc_json_path = versions_dir
        .join(&mc_version)
        .join(format!("{}.json", mc_version));
    let mc_json_str = tokio::fs::read_to_string(&mc_json_path)
        .await
        .context("No se pudo leer el JSON de Minecraft")?;
    let mc_json: serde_json::Value =
        serde_json::from_str(&mc_json_str).context("JSON de Minecraft inválido")?;
    // El índice de assets no coincide con la versión (1.20.1 usa el índice "5")
    let asset_index = mc_json["assetIndex"]["id"]
        .as_str()
        .unwrap_or(&mc_version)
        .to_string();

    let main_class = loader_json["mainClass"]
        .as_str()
        .context("mainClass no encontrado en JSON del loader")?
        .to_string();

    // ── Classpath ─────────────────────────────────────────────
    let mut classpath_entries: Vec<PathBuf> = Vec::new();
    add_libraries(&mc_json, &libs_dir, &mut classpath_entries);
    add_libraries(&loader_json, &libs_dir, &mut classpath_entries);
    classpath_entries.sort();
    classpath_entries.dedup();

    let mc_jar = versions_dir
        .join(&mc_version)
        .join(format!("{}.jar", mc_version));
    if mc_jar.exists() {
        classpath_entries.push(mc_jar);
    }

    let loader_jar = versions_dir
        .join(&version_id)
        .join(format!("{}.jar", version_id));
    if loader_jar.exists() {
        classpath_entries.push(loader_jar);
    }

    let sep = if cfg!(windows) { ";" } else { ":" };
    let classpath = classpath_entries
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(sep);

    // ── Module path ───────────────────────────────────────────
    let ignore_list: Vec<&str> = loader_json["arguments"]["jvm"]
        .as_array()
        .and_then(|args| {
            args.iter().find_map(|a| {
                a.as_str()
                    .filter(|s| s.starts_with("-DignoreList="))
                    .map(|s| s.trim_start_matches("-DignoreList="))
            })
        })
        .unwrap_or("")
        .split(',')
        .collect();

    let mut module_path_entries: Vec<String> = Vec::new();
    for entry in &classpath_entries {
        let filename = entry.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let in_ignore = ignore_list
            .iter()
            .any(|p| !p.is_empty() && filename.contains(p));
        if in_ignore {
            let s = entry.to_string_lossy().to_string();
            if !module_path_entries.contains(&s) {
                module_path_entries.push(s);
            }
        }
    }
    let module_path = module_path_entries.join(sep);

    // ── JVM args ──────────────────────────────────────────────
    let natives_dir = instance_dir.join("natives");
    tokio::fs::create_dir_all(&natives_dir).await.ok();

    let mut jvm_args: Vec<String> = vec![
        // RAM desde settings
        format!("-Xms{}M", settings.min_ram_mb),
        format!("-Xmx{}M", settings.max_ram_mb),
        "-XX:+UseG1GC".to_string(),
        "-XX:+ParallelRefProcEnabled".to_string(),
        "-XX:MaxGCPauseMillis=200".to_string(),
        "-Dminecraft.launcher.brand=kb-mc-launcher".to_string(),
        "-Dminecraft.launcher.version=1.0.0".to_string(),
        format!("-Djava.library.path={}", natives_dir.to_string_lossy()),
    ];

    // Args extra del usuario
    if !settings.extra_jvm_args.is_empty() {
        for arg in settings.extra_jvm_args.split_whitespace() {
            if arg.is_empty() {
                continue;
            }
            if is_gc_arg(arg) {
                warn!(
                    "[launcher] Filtrando GC arg de extraJvmArgs del usuario: {}",
                    arg
                );
                continue;
            }
            jvm_args.push(arg.to_string());
        }
    }
    // Args JVM del JSON del loader (Forge/Fabric)

    if let Some(jvm_json_args) = loader_json["arguments"]["jvm"].as_array() {
        let mut skip_next = false;
        for arg in jvm_json_args {
            if skip_next {
                skip_next = false;
                continue;
            }
            if let Some(s) = arg.as_str() {
                if s == "-cp" || s == "${classpath}" {
                    continue;
                }
                if s == "-p" {
                    jvm_args.push("-p".to_string());
                    jvm_args.push(module_path.clone());
                    skip_next = true;
                    continue;
                }
                // Filtrar args de GC del JSON del loader
                // para que no conflicten con los nuestros
                if is_gc_arg(s) {
                    debug!("[launcher] Filtrando GC arg del JSON del loader: {}", s);
                    continue;
                }
                let resolved = resolve_arg(
                    s,
                    &base_path,
                    &instance_dir,
                    &libs_dir,
                    &mc_version,
                    &asset_index,
                    &auth,
                );
                if !resolved.is_empty() {
                    jvm_args.push(resolved);
                }
            }
            // ... resto igual (obj/arr) también con el filtro:
            if let Some(obj) = arg.as_object() {
                let value = &obj["value"];
                if let Some(s) = value.as_str() {
                    if s == "-cp" || s == "${classpath}" {
                        continue;
                    }
                    if is_gc_arg(s) {
                        continue;
                    }
                    let resolved = resolve_arg(
                        s,
                        &base_path,
                        &instance_dir,
                        &libs_dir,
                        &mc_version,
                        &asset_index,
                        &auth,
                    );
                    if !resolved.is_empty() {
                        jvm_args.push(resolved);
                    }
                } else if let Some(arr) = value.as_array() {
                    for v in arr {
                        if let Some(s) = v.as_str() {
                            if s == "-cp" || s == "${classpath}" {
                                continue;
                            }
                            if is_gc_arg(s) {
                                continue;
                            }
                            let resolved = resolve_arg(
                                s,
                                &base_path,
                                &instance_dir,
                                &libs_dir,
                                &mc_version,
                                &asset_index,
                                &auth,
                            );
                            if !resolved.is_empty() {
                                jvm_args.push(resolved);
                            }
                        }
                    }
                }
            }
        }
    }

    jvm_args.push("-cp".to_string());
    jvm_args.push(classpath);

    // ── Game args ─────────────────────────────────────────────
    let mut game_args: Vec<String> = vec![
        "--username".to_string(),
        username.clone(),
        "--version".to_string(),
        version_id.clone(),
        "--gameDir".to_string(),
        instance_dir.to_string_lossy().to_string(),
        "--assetsDir".to_string(),
        base.join("assets").to_string_lossy().to_string(),
        "--assetIndex".to_string(),
        asset_index.clone(),
        "--uuid".to_string(),
        auth.uuid.clone(),
        "--accessToken".to_string(),
        auth.access_token.clone(),
        "--userType".to_string(),
        auth.user_type.to_string(),
        "--versionType".to_string(),
        "release".to_string(),
    ];

    // Pantalla desde settings
    if settings.fullscreen {
        game_args.push("--fullscreen".to_string());
        info!("[launcher::launch] Modo pantalla completa activado");
    } else {
        game_args.push("--width".to_string());
        game_args.push(settings.window_width.to_string());
        game_args.push("--height".to_string());
        game_args.push(settings.window_height.to_string());
        info!(
            "[launcher::launch] Resolución: {}x{}",
            settings.window_width, settings.window_height
        );
    }

    if let Some(game_json_args) = loader_json["arguments"]["game"].as_array() {
        for arg in game_json_args {
            if let Some(s) = arg.as_str() {
                let resolved = resolve_arg(
                    s,
                    &base_path,
                    &instance_dir,
                    &libs_dir,
                    &mc_version,
                    &asset_index,
                    &auth,
                );
                game_args.push(resolved);
            }
        }
    }

    // ── Ejecutar ──────────────────────────────────────────────
    let mut cmd_args = jvm_args;
    cmd_args.push(main_class);
    cmd_args.extend(game_args);

    info!("[launcher::launch] Lanzando con {} args", cmd_args.len());
    info!("[launcher] CMD ARGS COMPLETOS:");
    for (i, arg) in cmd_args.iter().enumerate() {
        // Nunca escribir el token de sesión en los logs
        let shown = if *arg == auth.access_token && auth.user_type == "msa" {
            "***"
        } else {
            arg.as_str()
        };
        info!("[launcher]   [{}] {}", i, shown);
    }
    match tokio::process::Command::new(&java_bin)
        .args(&cmd_args)
        .current_dir(&instance_dir)
        .env("SHIM_MCCOMPAT", "0x800000001")
        .spawn()
    {
        Ok(mut child) => {
            let pid = child.id().unwrap_or(0);
            info!("[launcher::launch] ✓ PID {:?}", pid);

            if let Some(state) = app.try_state::<RunningInstances>() {
                state
                    .processes
                    .lock()
                    .unwrap()
                    .insert(modpack_id.clone(), pid);
            } else {
                warn!("[launcher] RunningInstances no estaba registrado en el estado de Tauri");
            }

            app.emit(
                "game_started",
                serde_json::json!({
                    "modpackId": modpack_id,
                }),
            )
            .ok();

            let app_clone = app.clone();
            let modpack_id_clone = modpack_id.clone();
            tokio::spawn(async move {
                let status = child.wait().await;
                let exit_code = status.ok().and_then(|s| s.code());
                info!(
                    "[launcher::launch] Proceso del modpack '{}' finalizado (code={:?})",
                    modpack_id_clone, exit_code
                );

                // Desregistrar
                if let Some(state) = app_clone.try_state::<RunningInstances>() {
                    state.processes.lock().unwrap().remove(&modpack_id_clone);
                } else {
                    warn!("[launcher] RunningInstances no estaba registrado en el estado de Tauri");
                }

                app_clone
                    .emit(
                        "game_exited",
                        serde_json::json!({
                            "modpackId": modpack_id_clone,
                            "exitCode": exit_code,
                        }),
                    )
                    .ok();
            });

            Ok(())
        }
        Err(e) => {
            error!("[launcher::launch] Error lanzando '{}': {}", java_bin, e);
            #[cfg(target_os = "windows")]
            return Err(e).context(format!(
                "No se pudo lanzar Java ('{}').\nComprueba que Java 17+ está instalado.\nPuedes descargarlo desde https://adoptium.net",
                java_bin
            ));
            #[cfg(not(target_os = "windows"))]
            return Err(e).context(format!(
                "No se pudo lanzar Java ('{}').\nComprueba que Java 17+ está instalado.",
                java_bin
            ));
        }
    }
}

fn maven_name_to_path(libs_dir: &Path, name: &str) -> PathBuf {
    let parts: Vec<&str> = name.splitn(4, ':').collect();
    if parts.len() < 3 {
        return libs_dir.to_path_buf();
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let classifier = if parts.len() == 4 {
        format!("-{}", parts[3])
    } else {
        String::new()
    };
    libs_dir
        .join(group)
        .join(artifact)
        .join(version)
        .join(format!("{}-{}{}.jar", artifact, version, classifier))
}

fn add_libraries(json: &serde_json::Value, libs_dir: &Path, classpath_entries: &mut Vec<PathBuf>) {
    if let Some(libs) = json["libraries"].as_array() {
        for lib in libs {
            if let Some(path) = lib["downloads"]["artifact"]["path"].as_str() {
                let jar = libs_dir.join(path);
                if jar.exists() {
                    classpath_entries.push(jar);
                }
            }
            if let Some(name) = lib["name"].as_str() {
                let jar = maven_name_to_path(libs_dir, name);
                if jar.exists() {
                    classpath_entries.push(jar);
                }
            }
        }
    }
}

fn resolve_arg(
    arg: &str,
    base_path: &str,
    instance_dir: &Path,
    libs_dir: &Path,
    mc_version: &str,
    asset_index: &str,
    auth: &LaunchAuth,
) -> String {
    let sep = if cfg!(windows) { ";" } else { ":" };
    arg.replace("${game_directory}", &instance_dir.to_string_lossy())
        .replace("${assets_root}", &format!("{}/assets", base_path))
        .replace("${assets_index_name}", asset_index)
        .replace("${version_name}", mc_version)
        .replace("${auth_player_name}", &auth.username)
        .replace("${auth_uuid}", &auth.uuid)
        .replace("${auth_access_token}", &auth.access_token)
        .replace("${user_type}", auth.user_type)
        .replace("${version_type}", "release")
        .replace(
            "${natives_directory}",
            &instance_dir.join("natives").to_string_lossy(),
        )
        .replace("${launcher_name}", "kb-mc-launcher")
        .replace("${launcher_version}", "1.0.0")
        .replace("${library_directory}", &libs_dir.to_string_lossy())
        .replace("${classpath_separator}", sep)
}

fn is_gc_arg(arg: &str) -> bool {
    matches!(
        arg,
        "-XX:+UseG1GC"
            | "-XX:+UseZGC"
            | "-XX:+UseShenandoahGC"
            | "-XX:+UseParallelGC"
            | "-XX:+UseSerialGC"
            | "-XX:+UseConcMarkSweepGC"
    ) || arg.starts_with("-XX:+UseG1")
        || arg.starts_with("-XX:G1")
        || arg.starts_with("-XX:MaxGCPauseMillis")
        || arg.starts_with("-XX:+ParallelRefProcEnabled")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offline_uuid_matches_vanilla() {
        // Valor de UUID.nameUUIDFromBytes("OfflinePlayer:Notch") en Java
        assert_eq!(offline_uuid("Notch"), "b50ad385829d3141a2167e7d7539ba7f");
    }

    #[test]
    fn auth_without_token_is_offline() {
        let auth = LaunchAuth::new("Steve".into(), Some("abc".into()), None);
        assert_eq!(auth.user_type, "legacy");
        assert_eq!(auth.uuid, offline_uuid("Steve"));
    }

    #[test]
    fn auth_with_token_is_msa() {
        let auth = LaunchAuth::new("Steve".into(), Some("abc".into()), Some("tok".into()));
        assert_eq!(auth.user_type, "msa");
        assert_eq!(auth.access_token, "tok");
    }
}
