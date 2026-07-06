use tauri::AppHandle;
use tauri::Manager;
use crate::installer;
use std::path::Path;
use crate::launcher::{launch, LaunchSettings};
use crate::installer::sysinfo::{get_system_info, recommend_settings, RecommendedSettings};
use crate::auth::{microsoft, xbox, minecraft, skin};

#[derive(serde::Serialize)]
pub struct LoginStartResponse {
    pub user_code: String,
    pub verification_uri: String,
    pub device_code: String,
    pub interval: u64,
    pub expires_in: u64,
}

#[derive(serde::Serialize)]
pub struct LoginCompleteResponse {
    pub uuid: String,
    pub username: String,
    pub access_token: String,
    pub skin_head_base64: Option<String>,
}

#[tauri::command]
pub fn get_recommended_settings() -> RecommendedSettings {
    let info = get_system_info();
    let rec  = recommend_settings(&info);
    log::info!(
        "[commands::get_recommended_settings] min:{}MB max:{}MB, Argumentos recomendados: {:?}",
        rec.min_ram_mb, rec.max_ram_mb, rec.extra_jvm_args
    );
    rec
}
#[tauri::command]
pub async fn fetch_text(url: String) -> Result<String, String> {
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
) -> Result<(), String> {
    installer::install(
        app,
        base_path,
        mc_version,
        loader,
        loader_version,
        overrides_url,
        mods_url,
        modpack_id,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_modpack_installed(base_path: String, modpack_id: String) -> bool {
    let base = Path::new(&base_path);
    let instance_dir = base.join("instances").join(&modpack_id);
    let mods_dir     = instance_dir.join("mods");

    instance_dir.exists() && mods_dir.exists()
}

#[tauri::command]
pub async fn launch_modpack(
    base_path: String,
    modpack_id: String,
    mc_version: String,
    forge_version: String,
    username: String,
    min_ram_mb: Option<u32>,
    max_ram_mb: Option<u32>,
    fullscreen: Option<bool>,
    window_width: Option<u32>,
    window_height: Option<u32>,
    extra_jvm_args: Option<String>,
) -> Result<(), String> {
    let settings = LaunchSettings {
        min_ram_mb:     min_ram_mb.unwrap_or(512),
        max_ram_mb:     max_ram_mb.unwrap_or(4096),
        fullscreen:     fullscreen.unwrap_or(false),
        window_width:   window_width.unwrap_or(1280),
        window_height:  window_height.unwrap_or(720),
        extra_jvm_args: extra_jvm_args.unwrap_or_default(),
    };

    launch(base_path, modpack_id, mc_version, forge_version, username, settings)
        .await
        .map_err(|e| e.to_string())
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
    let result = tokio::process::Command::new("xdg-open")
        .arg(&path)
        .spawn();

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
pub async fn uninstall_modpack(
    base_path: String,
    modpack_id: String,
) -> Result<(), String> {
    log::info!("[commands::uninstall_modpack] Desinstalando: {}", modpack_id);

    let base         = std::path::Path::new(&base_path);
    let instance_dir = base.join("instances").join(&modpack_id);

    if !instance_dir.exists() {
        log::warn!("[commands::uninstall_modpack] Instancia no encontrada: {:?}", instance_dir);
        return Err(format!("El modpack '{}' no está instalado", modpack_id));
    }

    tokio::fs::remove_dir_all(&instance_dir).await
        .map_err(|e| {
            log::error!("[commands::uninstall_modpack] Error eliminando {:?}: {}", instance_dir, e);
            format!("Error desinstalando el modpack: {}", e)
        })?;

    log::info!("[commands::uninstall_modpack] ✓ Instancia eliminada: {:?}", instance_dir);
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
            tokio::fs::remove_dir_all(&path).await
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

#[tauri::command]
pub async fn auth_start() -> Result<LoginStartResponse, String> {
    let client = reqwest::Client::new();
    let device = microsoft::get_device_code(&client)
        .await
        .map_err(|e| e.to_string())?;

    Ok(LoginStartResponse {
        user_code:        device.user_code,
        verification_uri: device.verification_uri,
        device_code:      device.device_code,
        interval:         device.interval,
        expires_in:       device.expires_in,
    })
}
#[tauri::command]
pub async fn auth_poll(device_code: String, interval: u64) -> Result<LoginCompleteResponse, String> {
    let client = reqwest::Client::new();

    // Token de Microsoft
    let ms_token = microsoft::poll_token(&client, &device_code, interval)
        .await
        .map_err(|e| e.to_string())?;

    // Xbox Live + XSTS
    let xbox_tokens = xbox::authenticate(&client, &ms_token.access_token)
        .await
        .map_err(|e| e.to_string())?;

    // Minecraft
    let profile = minecraft::authenticate(&client, &xbox_tokens)
        .await
        .map_err(|e| e.to_string())?;

    // Cabeza de skin (opcional — no falla si no se puede obtener)
    let skin_head_base64 = if let Some(ref url) = profile.skin_url {
        skin::get_head_base64(url).await.ok()
    } else {
        None
    };

    Ok(LoginCompleteResponse {
        uuid:             profile.uuid,
        username:         profile.username,
        access_token:     profile.access_token,
        skin_head_base64,
    })
}