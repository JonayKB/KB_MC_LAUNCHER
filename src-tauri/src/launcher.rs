use crate::installer::requirements::get_java_binary_async;
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

pub struct LaunchSettings {
    pub min_ram_mb: u32,
    pub max_ram_mb: u32,
    pub fullscreen: bool,
    pub window_width: u32,
    pub window_height: u32,
    pub extra_jvm_args: String,
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
pub async fn launch(
    base_path: String,
    modpack_id: String,
    mc_version: String,
    forge_version: String,
    username: String,
    settings: LaunchSettings,
) -> Result<()> {
    let base = Path::new(&base_path);
    let instance_dir = base.join("instances").join(&modpack_id);
    let versions_dir = base.join("versions");
    let libs_dir = base.join("libraries");

    let java_bin = get_java_binary_async(base, &mc_version).await;
    log::info!("[launcher::launch] Usando Java: {}", java_bin);
    log::info!(
        "[launcher::launch] RAM: {}MB - {}MB | Fullscreen: {} | {}x{}",
        settings.min_ram_mb,
        settings.max_ram_mb,
        settings.fullscreen,
        settings.window_width,
        settings.window_height
    );

    let forge_id = format!("{}-forge-{}", mc_version, forge_version);
    let forge_json_path = versions_dir
        .join(&forge_id)
        .join(format!("{}.json", forge_id));

    let forge_json_str = tokio::fs::read_to_string(&forge_json_path)
        .await
        .context("No se pudo leer el JSON de Forge")?;
    let forge_json: serde_json::Value =
        serde_json::from_str(&forge_json_str).context("JSON de Forge inválido")?;

    let mc_json_path = versions_dir
        .join(&mc_version)
        .join(format!("{}.json", mc_version));
    let mc_json_str = tokio::fs::read_to_string(&mc_json_path)
        .await
        .context("No se pudo leer el JSON de Minecraft")?;
    let mc_json: serde_json::Value =
        serde_json::from_str(&mc_json_str).context("JSON de Minecraft inválido")?;

    let main_class = forge_json["mainClass"]
        .as_str()
        .context("mainClass no encontrado en JSON de Forge")?
        .to_string();

    // ── Classpath ─────────────────────────────────────────────
    let mut classpath_entries: Vec<PathBuf> = Vec::new();
    add_libraries(&mc_json, &libs_dir, &mut classpath_entries);
    add_libraries(&forge_json, &libs_dir, &mut classpath_entries);
    classpath_entries.sort();
    classpath_entries.dedup();

    let mc_jar = versions_dir
        .join(&mc_version)
        .join(format!("{}.jar", mc_version));
    if mc_jar.exists() {
        classpath_entries.push(mc_jar);
    }

    let forge_jar = versions_dir
        .join(&forge_id)
        .join(format!("{}.jar", forge_id));
    if forge_jar.exists() {
        classpath_entries.push(forge_jar);
    }

    let sep = if cfg!(windows) { ";" } else { ":" };
    let classpath = classpath_entries
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(sep);

    // ── Module path ───────────────────────────────────────────
    let ignore_list: Vec<&str> = forge_json["arguments"]["jvm"]
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
                log::warn!(
                    "[launcher] Filtrando GC arg de extraJvmArgs del usuario: {}",
                    arg
                );
                continue;
            }
            log::trace!("[launcher] extra JVM arg: {}", arg);
            jvm_args.push(arg.to_string());
        }
    }
    // Args del JSON de Forge
    // En launcher.rs, al procesar los JVM args del JSON de Forge:

    if let Some(jvm_json_args) = forge_json["arguments"]["jvm"].as_array() {
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
                // ← NUEVO: filtrar args de GC del JSON de Forge
                // para que no conflicten con los nuestros
                if is_gc_arg(s) {
                    log::debug!("[launcher] Filtrando GC arg del JSON de Forge: {}", s);
                    continue;
                }
                let resolved = resolve_arg(
                    s,
                    &base_path,
                    &instance_dir,
                    &libs_dir,
                    &mc_version,
                    &username,
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
                        &username,
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
                                &username,
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
        forge_id.clone(),
        "--gameDir".to_string(),
        instance_dir.to_string_lossy().to_string(),
        "--assetsDir".to_string(),
        base.join("assets").to_string_lossy().to_string(),
        "--assetIndex".to_string(),
        mc_version.clone(),
        "--uuid".to_string(),
        "0".to_string(),
        "--accessToken".to_string(),
        "0".to_string(),
        "--userType".to_string(),
        "legacy".to_string(),
        "--versionType".to_string(),
        "release".to_string(),
    ];

    // Pantalla desde settings
    if settings.fullscreen {
        game_args.push("--fullscreen".to_string());
        log::info!("[launcher::launch] Modo pantalla completa activado");
    } else {
        game_args.push("--width".to_string());
        game_args.push(settings.window_width.to_string());
        game_args.push("--height".to_string());
        game_args.push(settings.window_height.to_string());
        log::info!(
            "[launcher::launch] Resolución: {}x{}",
            settings.window_width,
            settings.window_height
        );
    }

    if let Some(game_json_args) = forge_json["arguments"]["game"].as_array() {
        for arg in game_json_args {
            if let Some(s) = arg.as_str() {
                let resolved = resolve_arg(
                    s,
                    &base_path,
                    &instance_dir,
                    &libs_dir,
                    &mc_version,
                    &username,
                );
                game_args.push(resolved);
            }
        }
    }

    // ── Ejecutar ──────────────────────────────────────────────
    let mut cmd_args = jvm_args;
    cmd_args.push(main_class);
    cmd_args.extend(game_args);

    log::info!("[launcher::launch] Lanzando con {} args", cmd_args.len());
    log::info!("[launcher] CMD ARGS COMPLETOS:");
    for (i, arg) in cmd_args.iter().enumerate() {
        log::info!("[launcher]   [{}] {}", i, arg);
    }
    match tokio::process::Command::new(&java_bin)
        .args(&cmd_args)
        .current_dir(&instance_dir)
        .spawn()
    {
        Ok(child) => {
            log::info!("[launcher::launch] ✓ PID {:?}", child.id());
            Ok(())
        }
        Err(e) => {
            log::error!("[launcher::launch] Error lanzando '{}': {}", java_bin, e);
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
    username: &str,
) -> String {
    let sep = if cfg!(windows) { ";" } else { ":" };
    arg.replace("${game_directory}", &instance_dir.to_string_lossy())
        .replace("${assets_root}", &format!("{}/assets", base_path))
        .replace("${assets_index_name}", mc_version)
        .replace("${version_name}", mc_version)
        .replace("${auth_player_name}", username)
        .replace("${auth_uuid}", "0")
        .replace("${auth_access_token}", "0")
        .replace("${user_type}", "legacy")
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
