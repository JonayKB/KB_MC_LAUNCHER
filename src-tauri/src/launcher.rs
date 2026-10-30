use crate::game_logs;
use crate::installer::download;
use crate::installer::extract;
use crate::installer::loaders::{fabric, forge, neoforge};
use crate::installer::progress::Reporter;
use crate::installer::requirements::{ensure_java, required_java_major};
use crate::installer::rules::{self, library_key, maven_relative_path, rules_allow, NativeLibrary};
use crate::installer::sysinfo::gc_args;
use crate::process_ext::NoConsoleWindow;
use crate::RunningInstances;
use anyhow::{Context, Result};
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
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

/// Lo necesario para preparar una partida
pub struct LaunchRequest<'a> {
    pub base: &'a Path,
    pub modpack_id: &'a str,
    pub mc_version: &'a str,
    pub loader: &'a str,
    pub loader_version: &'a str,
    pub auth: &'a LaunchAuth,
    pub settings: &'a LaunchSettings,
    pub launcher_version: &'a str,
}

/// Comando completo de una partida
pub struct LaunchPlan {
    pub java_bin: PathBuf,
    pub args: Vec<String>,
    pub instance_dir: PathBuf,
}

/// Carpeta de `versions/` con el JSON del loader
pub fn version_id(mc_version: &str, loader: &str, loader_version: &str) -> Result<String> {
    Ok(match loader {
        "forge" => forge::version_id(mc_version, loader_version),
        "neoforge" => neoforge::version_id(loader_version),
        "fabric" => fabric::version_id(mc_version, loader_version),
        "vanilla" => mc_version.to_string(),
        other => anyhow::bail!("El loader '{}' no está soportado", other),
    })
}

async fn read_json(path: &Path, what: &str) -> Result<Value> {
    let text = tokio::fs::read_to_string(path)
        .await
        .with_context(|| format!("No se pudo leer el JSON de {}. ¿Está instalado el modpack?", what))?;
    serde_json::from_str(&text).with_context(|| format!("JSON de {} inválido", what))
}

/// Sustituye las variables de los argumentos de los JSON de versión
struct ArgResolver<'a> {
    base: &'a Path,
    instance_dir: &'a Path,
    natives_dir: &'a Path,
    libs_dir: &'a Path,
    mc_version: &'a str,
    asset_index: &'a str,
    auth: &'a LaunchAuth,
    launcher_version: &'a str,
}

impl ArgResolver<'_> {
    fn resolve(&self, arg: &str) -> String {
        let sep = if cfg!(windows) { ";" } else { ":" };
        let assets = self.base.join("assets");
        arg.replace("${game_directory}", &self.instance_dir.to_string_lossy())
            .replace("${assets_root}", &assets.to_string_lossy())
            .replace("${game_assets}", &assets.to_string_lossy())
            .replace("${assets_index_name}", self.asset_index)
            .replace("${version_name}", self.mc_version)
            .replace("${auth_player_name}", &self.auth.username)
            .replace("${auth_uuid}", &self.auth.uuid)
            .replace("${auth_access_token}", &self.auth.access_token)
            .replace("${auth_session}", &self.auth.access_token)
            .replace("${user_type}", self.auth.user_type)
            .replace("${user_properties}", "{}")
            .replace("${version_type}", "release")
            .replace("${natives_directory}", &self.natives_dir.to_string_lossy())
            .replace("${launcher_name}", "kb-mc-launcher")
            .replace("${launcher_version}", self.launcher_version)
            .replace("${library_directory}", &self.libs_dir.to_string_lossy())
            .replace("${classpath_separator}", sep)
    }
}

/// Valores de `arguments.jvm`/`arguments.game` que aplican a este sistema
fn json_args(entries: &Value) -> Vec<&str> {
    let mut args = Vec::new();
    for entry in entries.as_array().into_iter().flatten() {
        if let Some(arg) = entry.as_str() {
            args.push(arg);
        } else if rules_allow(entry.get("rules")) {
            match &entry["value"] {
                Value::String(arg) => args.push(arg.as_str()),
                Value::Array(values) => args.extend(values.iter().filter_map(Value::as_str)),
                _ => {}
            }
        }
    }
    args
}

/// Bibliotecas del JSON que aplican aquí y están en disco. Con la clave de
/// `library_key`, el loader sustituye a la versión que traiga Minecraft.
fn add_libraries(json: &Value, libs_dir: &Path, libraries: &mut BTreeMap<String, PathBuf>) {
    for lib in json["libraries"].as_array().into_iter().flatten() {
        if !rules_allow(lib.get("rules")) {
            continue;
        }
        let name = lib["name"].as_str().unwrap_or_default();
        let jar = lib["downloads"]["artifact"]["path"]
            .as_str()
            .map(String::from)
            .or_else(|| maven_relative_path(name))
            .map(|path| libs_dir.join(path));
        if let Some(jar) = jar.filter(|jar| jar.exists()) {
            libraries.insert(library_key(name), jar);
        }
    }
}

/// Minecraft anterior a la 1.19: los nativos van en jars aparte que hay que extraer
async fn prepare_legacy_natives(jsons: &[&Value], libs_dir: &Path, natives_dir: &Path) -> Result<()> {
    let natives: Vec<NativeLibrary> = jsons.iter().flat_map(|json| rules::native_libraries(json)).collect();
    if natives.is_empty() {
        return Ok(());
    }

    let items = natives
        .iter()
        .map(|native| (native.file.0.clone(), libs_dir.join(&native.file.1)))
        .collect();
    let failures = download::download_many(items, 8, None, "Nativos").await;
    if let Some(failure) = failures.first() {
        anyhow::bail!("No se pudieron descargar los nativos del juego: {}", failure.error);
    }

    let (libs_dir, natives_dir) = (libs_dir.to_owned(), natives_dir.to_owned());
    extract::run_uninterrupted(move || {
        for native in &natives {
            extract_native(&libs_dir.join(&native.file.1), &natives_dir, &native.exclude)?;
        }
        Ok(())
    })
    .await
}

fn extract_native(jar: &Path, natives_dir: &Path, exclude: &[String]) -> Result<()> {
    let file = std::fs::File::open(jar).with_context(|| format!("No se pudo abrir {:?}", jar))?;
    let mut archive = zip::ZipArchive::new(file).with_context(|| format!("Jar inválido: {:?}", jar))?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let Some(relative) = entry.enclosed_name() else { continue };
        let skip = exclude.iter().any(|prefix| entry.name().starts_with(prefix.as_str()));
        if skip || entry.is_dir() {
            continue;
        }
        let out_path = natives_dir.join(relative);
        // Otra partida anterior ya lo extrajo (y en Windows podría estar en uso)
        if std::fs::metadata(&out_path).is_ok_and(|m| m.len() == entry.size()) {
            continue;
        }
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::io::copy(&mut entry, &mut std::fs::File::create(&out_path)?)?;
    }
    Ok(())
}

/// Prepara Java y los nativos y construye el comando de la partida
pub async fn build_plan(request: &LaunchRequest<'_>, reporter: &Reporter) -> Result<LaunchPlan> {
    let LaunchRequest { base, modpack_id, mc_version, loader, loader_version, auth, settings, launcher_version } = *request;
    let instance_dir = base.join("instances").join(modpack_id);
    let versions_dir = base.join("versions");
    let libs_dir = base.join("libraries");

    let version_id = version_id(mc_version, loader, loader_version)?;
    let mc_json = read_json(&versions_dir.join(mc_version).join(format!("{}.json", mc_version)), "Minecraft").await?;
    // Vanilla no tiene JSON aparte: es el propio de Minecraft
    let loader_json = if loader == "vanilla" {
        None
    } else {
        Some(read_json(&versions_dir.join(&version_id).join(format!("{}.json", version_id)), "loader").await?)
    };
    let mut jsons: Vec<&Value> = loader_json.iter().collect();
    jsons.push(&mc_json);
    let top_json = jsons[0];

    let java_major = required_java_major(mc_version, &jsons);
    let java_bin = ensure_java(java_major, base, reporter).await?;
    info!("[launcher::build_plan] Java {}: {:?}", java_major, java_bin);
    info!(
        "[launcher::build_plan] RAM: {}MB - {}MB | Fullscreen: {} | {}x{}",
        settings.min_ram_mb, settings.max_ram_mb, settings.fullscreen, settings.window_width, settings.window_height
    );
    set_gpu_preference_high_performance(&java_bin.to_string_lossy());

    // El índice de assets no coincide con la versión (1.20.1 usa el índice "5")
    let asset_index = mc_json["assetIndex"]["id"].as_str().unwrap_or(mc_version).to_string();
    let main_class = top_json["mainClass"]
        .as_str()
        .context("mainClass no encontrado en el JSON")?
        .to_string();

    // ── Classpath ─────────────────────────────────────────────
    let mut libraries = BTreeMap::new();
    add_libraries(&mc_json, &libs_dir, &mut libraries);
    if let Some(json) = &loader_json {
        add_libraries(json, &libs_dir, &mut libraries);
    }
    let mut classpath_entries: Vec<PathBuf> = libraries.into_values().collect();
    classpath_entries.sort();
    classpath_entries.dedup();

    let mc_jar = versions_dir.join(mc_version).join(format!("{}.jar", mc_version));
    if mc_jar.exists() {
        classpath_entries.push(mc_jar);
    }
    let loader_jar = versions_dir.join(&version_id).join(format!("{}.jar", version_id));
    if loader != "vanilla" && loader_jar.exists() {
        classpath_entries.push(loader_jar);
    }

    let sep = if cfg!(windows) { ";" } else { ":" };
    let classpath = classpath_entries
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(sep);

    // ── Nativos ───────────────────────────────────────────────
    let natives_dir = instance_dir.join("natives");
    for sub in ["java", "jna", "lwjgl", "netty"] {
        tokio::fs::create_dir_all(natives_dir.join(sub)).await.ok();
    }
    prepare_legacy_natives(&jsons, &libs_dir, &natives_dir).await?;

    let resolver = ArgResolver {
        base,
        instance_dir: &instance_dir,
        natives_dir: &natives_dir,
        libs_dir: &libs_dir,
        mc_version,
        asset_index: &asset_index,
        auth,
        launcher_version,
    };

    // ── JVM args ──────────────────────────────────────────────
    let mut jvm_args: Vec<String> = vec![
        // RAM desde settings
        format!("-Xms{}M", settings.min_ram_mb),
        format!("-Xmx{}M", settings.max_ram_mb),
        "-Dminecraft.launcher.brand=kb-mc-launcher".to_string(),
        format!("-Dminecraft.launcher.version={}", launcher_version),
    ];

    // ── Recolector de basura ──────────────────────────────────
    // Si el usuario elige uno en sus args extra se respeta; si no, se elige
    // según la versión de Java del modpack y la RAM asignada.
    let user_args: Vec<&str> = settings.extra_jvm_args.split_whitespace().collect();
    if let Some(user_gc) = user_args.iter().find(|a| is_gc_selector(a)) {
        info!("[launcher] GC elegido por el usuario: {}", user_gc);
    } else {
        let gc = gc_args(java_major, settings.max_ram_mb, num_cpus::get());
        info!(
            "[launcher] GC automático: {} (Java {}, {}MB)",
            gc.name, java_major, settings.max_ram_mb
        );
        jvm_args.extend(gc.args);
    }

    // Args extra (los recomendados y los del usuario): van después de los
    // automáticos para que, si se repite un flag, gane el del usuario
    jvm_args.extend(user_args.iter().map(|a| a.to_string()));

    // Args del JSON de Minecraft y, encima, los del loader
    let mut json_jvm_args: Vec<&str> = json_args(&mc_json["arguments"]["jvm"]);
    if let Some(json) = &loader_json {
        json_jvm_args.extend(json_args(&json["arguments"]["jvm"]));
    }
    let mut args = json_jvm_args.into_iter();
    while let Some(arg) = args.next() {
        if arg == "-cp" || arg == "${classpath}" {
            continue;
        }
        // Filtrar args de GC para que no conflicten con los nuestros
        if is_gc_arg(arg) {
            debug!("[launcher] Filtrando GC arg del JSON: {}", arg);
            continue;
        }
        let resolved = resolver.resolve(arg);
        if !resolved.is_empty() {
            jvm_args.push(resolved);
        }
    }

    // Los JSON antiguos no indican la ruta de los nativos
    if !jvm_args.iter().any(|a| a.starts_with("-Djava.library.path=")) {
        jvm_args.push(format!("-Djava.library.path={}", natives_dir.to_string_lossy()));
    }

    jvm_args.push("-cp".to_string());
    jvm_args.push(classpath);

    // ── Game args ─────────────────────────────────────────────
    // Hasta la 1.12 van en una sola cadena, y el loader la sustituye entera
    let legacy_game_args = jsons.iter().find_map(|json| json["minecraftArguments"].as_str());
    let mut game_args: Vec<String> = match legacy_game_args {
        Some(template) => template.split_whitespace().map(|arg| resolver.resolve(arg)).collect(),
        None => vec![
            "--username".to_string(),
            auth.username.clone(),
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
        ],
    };

    // Pantalla desde settings
    if settings.fullscreen {
        game_args.push("--fullscreen".to_string());
    } else {
        game_args.push("--width".to_string());
        game_args.push(settings.window_width.to_string());
        game_args.push("--height".to_string());
        game_args.push(settings.window_height.to_string());
    }

    if let Some(json) = &loader_json {
        game_args.extend(json_args(&json["arguments"]["game"]).into_iter().map(|arg| resolver.resolve(arg)));
    }

    let mut cmd_args = jvm_args;
    cmd_args.push(main_class);
    cmd_args.extend(game_args);

    Ok(LaunchPlan { java_bin, args: cmd_args, instance_dir })
}

pub async fn launch(
    app: AppHandle,
    base_path: String,
    modpack_id: String,
    modpack_name: String,
    mc_version: String,
    loader: String,
    loader_version: String,
    auth: LaunchAuth,
    settings: LaunchSettings,
) -> Result<()> {
    let launcher_version = app.package_info().version.to_string();
    let plan = build_plan(
        &LaunchRequest {
            base: Path::new(&base_path),
            modpack_id: &modpack_id,
            mc_version: &mc_version,
            loader: &loader,
            loader_version: &loader_version,
            auth: &auth,
            settings: &settings,
            launcher_version: &launcher_version,
        },
        &Reporter::none(),
    )
    .await?;

    info!("[launcher::launch] Lanzando con {} args", plan.args.len());
    for (i, arg) in plan.args.iter().enumerate() {
        info!("[launcher]   [{}] {}", i, mask_token(arg, &auth));
    }
    let mut command = tokio::process::Command::new(&plan.java_bin);
    command
        .args(&plan.args)
        .current_dir(&plan.instance_dir)
        .env("SHIM_MCCOMPAT", "0x800000001")
        // La salida se muestra en la ventana de logs del launcher, no en una consola
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .no_console_window();

    match command.spawn() {
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

            let (kill_rx, log_reader) = game_logs::start_session(
                &app,
                &modpack_id,
                &modpack_name,
                child.stdout.take(),
                child.stderr.take(),
            );

            app.emit(
                "game_started",
                serde_json::json!({
                    "modpackId": modpack_id,
                }),
            )
            .ok();

            let app_clone = app.clone();
            let modpack_id_clone = modpack_id.clone();
            let started_at = std::time::Instant::now();
            tokio::spawn(async move {
                let status = tokio::select! {
                    status = child.wait() => status,
                    // Si el emisor se descarta sin enviar, esta rama se ignora
                    Ok(()) = kill_rx => {
                        info!("[launcher::launch] Deteniendo '{}' a petición del usuario", modpack_id_clone);
                        let _ = child.kill().await;
                        child.wait().await
                    }
                };
                let exit_code = status.ok().and_then(|s| s.code());
                // Para el historial de horas jugadas (lo guarda el frontend)
                let duration_secs = started_at.elapsed().as_secs();

                // Esperar a leer las últimas líneas antes de marcar la sesión como cerrada
                let _ = tokio::time::timeout(std::time::Duration::from_secs(3), log_reader).await;
                game_logs::finish_session(&app_clone, &modpack_id_clone, exit_code);
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
                            "durationSecs": duration_secs,
                        }),
                    )
                    .ok();
            });

            Ok(())
        }
        Err(e) => {
            error!("[launcher::launch] Error lanzando {:?}: {}", plan.java_bin, e);
            Err(e).context(format!("No se pudo lanzar Java ({:?})", plan.java_bin))
        }
    }
}

/// Nunca escribir el token de sesión en los logs
fn mask_token(arg: &str, auth: &LaunchAuth) -> String {
    if auth.user_type == "msa" {
        arg.replace(&auth.access_token, "***")
    } else {
        arg.to_string()
    }
}

/// Flag que selecciona un recolector de basura concreto
fn is_gc_selector(arg: &str) -> bool {
    matches!(
        arg,
        "-XX:+UseG1GC"
            | "-XX:+UseZGC"
            | "-XX:+UseShenandoahGC"
            | "-XX:+UseParallelGC"
            | "-XX:+UseSerialGC"
            | "-XX:+UseConcMarkSweepGC"
    )
}

/// Flags de GC que traiga el JSON del loader: se ignoran para no chocar con los nuestros
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
    fn token_never_reaches_the_logs() {
        let auth = LaunchAuth::new("Steve".into(), Some("abc".into()), Some("tok123".into()));
        assert_eq!(mask_token("--accessToken", &auth), "--accessToken");
        assert_eq!(mask_token("tok123", &auth), "***");
        assert_eq!(mask_token("token:tok123:Steve", &auth), "token:***:Steve");
    }

    #[test]
    fn json_args_apply_rules_and_values() {
        let args = serde_json::json!([
            "-a",
            { "rules": [{ "action": "allow", "os": { "name": "plan9" } }], "value": "-no" },
            { "rules": [{ "action": "allow" }], "value": ["-b", "-c"] }
        ]);
        assert_eq!(json_args(&args), vec!["-a", "-b", "-c"]);
    }

    #[test]
    fn loader_library_replaces_minecraft_version() {
        let dir = tempfile::tempdir().unwrap();
        for version in ["1", "2"] {
            let jar = dir.path().join(maven_relative_path(&format!("g:a:{version}")).unwrap());
            std::fs::create_dir_all(jar.parent().unwrap()).unwrap();
            std::fs::write(jar, "").unwrap();
        }
        let mut libraries = BTreeMap::new();
        add_libraries(&serde_json::json!({ "libraries": [{ "name": "g:a:1" }] }), dir.path(), &mut libraries);
        add_libraries(&serde_json::json!({ "libraries": [{ "name": "g:a:2" }] }), dir.path(), &mut libraries);
        assert_eq!(libraries.len(), 1);
        assert!(libraries["g:a"].ends_with("a-2.jar"));
    }

    #[test]
    fn gc_selector_only_matches_collector_choice() {
        assert!(is_gc_selector("-XX:+UseZGC"));
        assert!(is_gc_selector("-XX:+UseG1GC"));
        assert!(!is_gc_selector("-XX:MaxGCPauseMillis=50"));
        assert!(!is_gc_selector("-XX:-UseZGC"));
    }

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
