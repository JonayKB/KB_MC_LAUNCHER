use crate::auth::{microsoft, minecraft, skin, xbox};
use crate::installer;
use crate::installer::sysinfo::{get_system_info, recommend_settings, RecommendedSettings};
use crate::launcher::{launch, LaunchAuth, LaunchSettings};
use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

/// Únicos orígenes que el frontend puede descargar mediante `fetch_text`
const ALLOWED_FETCH_PREFIXES: &[&str] = &["https://me.jonaykb.com/"];

#[derive(serde::Serialize)]
pub struct LoginCompleteResponse {
    pub uuid: String,
    pub username: String,
    pub access_token: String,
    pub skin_head_base64: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_in: u64,
}

#[tauri::command]
pub fn get_recommended_settings(app: tauri::AppHandle) -> RecommendedSettings {
    let info = get_system_info(&app);
    let rec = recommend_settings(&info);
    log::info!(
        "[commands::get_recommended_settings] min:{}MB max:{}MB, Argumentos recomendados: {:?}",
        rec.min_ram_mb,
        rec.max_ram_mb,
        rec.extra_jvm_args
    );
    rec
}
#[tauri::command]
pub async fn fetch_text(url: String) -> Result<String, String> {
    if !ALLOWED_FETCH_PREFIXES.iter().any(|p| url.starts_with(p)) {
        return Err(format!("URL no permitida: {}", url));
    }
    reqwest::get(&url)
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_base_path(app: tauri::AppHandle) -> String {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| {
            dirs::home_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join(".mc_launcher")
        })
        .to_string_lossy()
        .to_string()
}
#[tauri::command]
pub async fn install_modpack(
    app: AppHandle,
    base_path: String,
    mc_version: String,
    loader: String,
    loader_version: Option<String>,
    overrides_url: String,
    mods_url: String,
    modpack_id: String,
    version: Option<String>,
) -> Result<(), String> {
    validate_modpack_id(&modpack_id)?;
    installer::install(
        app,
        base_path,
        mc_version,
        loader,
        loader_version,
        overrides_url,
        mods_url,
        modpack_id,
        version,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_modpack_installed(base_path: String, modpack_id: String) -> bool {
    if validate_modpack_id(&modpack_id).is_err() {
        return false;
    }
    let base = Path::new(&base_path);
    let instance_dir = base.join("instances").join(&modpack_id);
    let mods_dir = instance_dir.join("mods");

    instance_dir.exists() && mods_dir.exists()
}

/// Modpacks con una instancia de Minecraft abierta ahora mismo
#[derive(Default)]
pub struct RunningGames(pub Mutex<HashSet<String>>);

#[tauri::command]
pub fn is_game_running(state: State<'_, RunningGames>, modpack_id: String) -> bool {
    state.0.lock().unwrap().contains(&modpack_id)
}

/// Versión del modpack instalada, o `None` si no consta (instalaciones antiguas)
#[tauri::command]
pub async fn get_installed_version(base_path: String, modpack_id: String) -> Option<String> {
    validate_modpack_id(&modpack_id).ok()?;
    let file = Path::new(&base_path)
        .join("instances")
        .join(&modpack_id)
        .join(installer::INSTALLED_VERSION_FILE);
    tokio::fs::read_to_string(file)
        .await
        .ok()
        .map(|v| v.trim().to_string())
}

#[tauri::command]
pub async fn launch_modpack(
    app: AppHandle,
    base_path: String,
    modpack_id: String,
    mc_version: String,
    forge_version: String,
    username: String,
    uuid: Option<String>,
    access_token: Option<String>,
    min_ram_mb: Option<u32>,
    max_ram_mb: Option<u32>,
    fullscreen: Option<bool>,
    window_width: Option<u32>,
    window_height: Option<u32>,
    extra_jvm_args: Option<String>,
) -> Result<(), String> {
    validate_modpack_id(&modpack_id)?;

    if !app
        .state::<RunningGames>()
        .0
        .lock()
        .unwrap()
        .insert(modpack_id.clone())
    {
        return Err("Este modpack ya se está ejecutando".to_string());
    }

    let settings = LaunchSettings {
        min_ram_mb: min_ram_mb.unwrap_or(512),
        max_ram_mb: max_ram_mb.unwrap_or(4096),
        fullscreen: fullscreen.unwrap_or(false),
        window_width: window_width.unwrap_or(1280),
        window_height: window_height.unwrap_or(720),
        extra_jvm_args: extra_jvm_args.unwrap_or_default(),
    };

    let result = launch(
        base_path,
        modpack_id.clone(),
        mc_version,
        forge_version,
        LaunchAuth::new(username, uuid, access_token),
        settings,
    )
    .await;

    let mut child = match result {
        Ok(child) => child,
        Err(e) => {
            app.state::<RunningGames>().0.lock().unwrap().remove(&modpack_id);
            return Err(e.to_string());
        }
    };

    let _ = app.emit("game_started", &modpack_id);

    tauri::async_runtime::spawn(async move {
        let status = child.wait().await;
        log::info!(
            "[commands::launch_modpack] Juego cerrado ({}): {:?}",
            modpack_id,
            status
        );
        app.state::<RunningGames>().0.lock().unwrap().remove(&modpack_id);
        let _ = app.emit("game_exited", &modpack_id);
    });

    Ok(())
}

/// Evita rutas fuera de `instances/` (p.ej. "../..") a partir de un id
fn validate_modpack_id(modpack_id: &str) -> Result<(), String> {
    let valid = !modpack_id.is_empty()
        && modpack_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        && !modpack_id.contains("..");
    if valid {
        Ok(())
    } else {
        Err(format!("Identificador de modpack inválido: {}", modpack_id))
    }
}

#[tauri::command]
pub async fn open_directory(path: String) -> Result<(), String> {
    log::info!("[commands::open_directory] Abriendo: {}", path);

    let dir = std::path::Path::new(&path);

    if !dir.exists() {
        log::warn!("[commands::open_directory] Directorio no existe: {}", path);
        return Err(format!("El directorio no existe: {}", path));
    }

    #[cfg(target_os = "windows")]
    let result = {
        let win_path = path.replace('/', "\\");
        log::info!("[commands::open_directory] win_path: {}", win_path);
        tokio::process::Command::new("explorer")
            .arg(&win_path)
            .spawn()
    };

    #[cfg(target_os = "linux")]
    let result = tokio::process::Command::new("xdg-open").arg(&path).spawn();

    #[cfg(target_os = "macos")]
    let result = tokio::process::Command::new("open").arg(&path).spawn();

    match result {
        Ok(_) => {
            log::info!("[commands::open_directory] ✓ Abierto: {}", path);
            Ok(())
        }
        Err(e) => {
            log::error!("[commands::open_directory] Error abriendo {}: {}", path, e);
            Err(format!("No se pudo abrir el directorio: {}", e))
        }
    }
}

#[tauri::command]
pub async fn uninstall_modpack(base_path: String, modpack_id: String) -> Result<(), String> {
    validate_modpack_id(&modpack_id)?;
    log::info!(
        "[commands::uninstall_modpack] Desinstalando: {}",
        modpack_id
    );

    let base = std::path::Path::new(&base_path);
    let instance_dir = base.join("instances").join(&modpack_id);

    if !instance_dir.exists() {
        log::warn!(
            "[commands::uninstall_modpack] Instancia no encontrada: {:?}",
            instance_dir
        );
        return Err(format!("El modpack '{}' no está instalado", modpack_id));
    }

    tokio::fs::remove_dir_all(&instance_dir)
        .await
        .map_err(|e| {
            log::error!(
                "[commands::uninstall_modpack] Error eliminando {:?}: {}",
                instance_dir,
                e
            );
            format!("Error desinstalando el modpack: {}", e)
        })?;

    log::info!(
        "[commands::uninstall_modpack] ✓ Instancia eliminada: {:?}",
        instance_dir
    );
    Ok(())
}

#[tauri::command]
pub async fn clear_all_cache(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;

    log::info!("[commands::clear_all_cache] Borrando: {:?}", base);

    for folder in &["instances", "versions", "libraries", "assets", "java"] {
        let path = base.join(folder);
        if path.exists() {
            tokio::fs::remove_dir_all(&path)
                .await
                .map_err(|e| format!("Error borrando {}: {}", folder, e))?;
            log::info!("[commands::clear_all_cache] Eliminado: {:?}", path);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn restart_app(app: tauri::AppHandle) -> Result<(), String> {
    app.restart();
}

async fn complete_login(
    ms_tokens: microsoft::MicrosoftTokens,
) -> Result<LoginCompleteResponse, String> {
    let client = reqwest::Client::new();

    let xbox = xbox::authenticate(&client, &ms_tokens.access_token)
        .await
        .map_err(|e| e.to_string())?;

    let profile = minecraft::authenticate(&client, &xbox)
        .await
        .map_err(|e| e.to_string())?;

    // La cabeza de la skin es opcional: si falla no bloquea el login
    let skin_head_base64 = match &profile.skin_url {
        Some(url) => skin::get_head_base64(url)
            .await
            .map_err(|e| log::warn!("[commands::auth] No se pudo obtener la skin: {}", e))
            .ok(),
        None => None,
    };

    Ok(LoginCompleteResponse {
        uuid: profile.uuid,
        username: profile.username,
        access_token: profile.access_token,
        skin_head_base64,
        refresh_token: ms_tokens.refresh_token,
        expires_in: profile.expires_in,
    })
}

#[tauri::command]
pub async fn auth_microsoft() -> Result<LoginCompleteResponse, String> {
    let ms_tokens = microsoft::login().await.map_err(|e| e.to_string())?;
    complete_login(ms_tokens).await
}

#[tauri::command]
pub async fn refresh_microsoft(refresh_token: String) -> Result<LoginCompleteResponse, String> {
    let ms_tokens = microsoft::refresh(&refresh_token)
        .await
        .map_err(|e| e.to_string())?;
    complete_login(ms_tokens).await
}
