use crate::auth::{microsoft, minecraft, skin, xbox};
use crate::installer::sysinfo::{get_system_info, recommend_settings, RecommendedSettings};
use crate::launcher::{launch, LaunchAuth, LaunchSettings};
use crate::{installer, RunningInstances};
use std::future::Future;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, Window};
use tracing::{error, info, warn};

/// Únicos orígenes que el frontend puede descargar mediante `fetch_text`
const ALLOWED_FETCH_PREFIXES: &[&str] = &["https://me.jonaykb.com/"];

#[derive(serde::Serialize)]
pub struct LoginCompleteResponse {
    pub uuid: String,
    pub username: String,
    pub access_token: String,
    pub skin_head_base64: Option<String>,
    pub expires_in: u64,
    pub refresh_token: String,
}

#[tauri::command]
pub fn is_modpack_running(state: tauri::State<RunningInstances>, modpack_id: String) -> bool {
    state.processes.lock().unwrap().contains_key(&modpack_id)
}

#[tauri::command]
pub fn get_recommended_settings(app: tauri::AppHandle) -> RecommendedSettings {
    let info = get_system_info(&app);
    let rec = recommend_settings(&info);
    info!(
        "[commands::get_recommended_settings] min:{}MB max:{}MB, Argumentos recomendados: {:?}",
        rec.min_ram_mb, rec.max_ram_mb, rec.extra_jvm_args
    );
    rec
}
#[tauri::command]
pub async fn fetch_text(url: String) -> Result<String, String> {
    if !ALLOWED_FETCH_PREFIXES.iter().any(|p| url.starts_with(p)) {
        return Err(format!("URL no permitida: {}", url));
    }
    installer::http::get_text(&url).await.map_err(|e| format!("{:#}", e))
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
/// Instalación en curso (solo una a la vez: comparten archivos temporales)
#[derive(Default)]
pub struct InstallState(pub Mutex<Option<tokio::task::AbortHandle>>);

/// Error que recibe el frontend cuando el usuario cancela la instalación
const INSTALL_CANCELLED: &str = "CANCELLED";

/// Comprueba que nada esté usando los archivos antes de cambiarlos o borrarlos
fn ensure_not_running(app: &AppHandle, modpack_id: Option<&str>) -> Result<(), String> {
    let processes = app.state::<RunningInstances>();
    let processes = processes.processes.lock().unwrap();
    let running = match modpack_id {
        Some(id) => processes.contains_key(id),
        None => !processes.is_empty(),
    };
    if running {
        return Err("Cierra el juego antes de continuar".to_string());
    }
    Ok(())
}

fn ensure_no_install(app: &AppHandle) -> Result<(), String> {
    if app.state::<InstallState>().0.lock().unwrap().is_some() {
        return Err("Ya hay una instalación en curso".to_string());
    }
    Ok(())
}

/// Ejecuta una instalación/actualización registrándola para poder cancelarla.
/// Si no termina bien, una instancia nueva se borra entera; una existente sigue
/// como estaba, porque lo nuevo se prepara aparte (ver `installer::apply_content`).
async fn run_cancellable_install<F>(
    app: &AppHandle,
    base_path: &str,
    modpack_id: &str,
    task: F,
) -> Result<(), String>
where
    F: Future<Output = anyhow::Result<()>> + Send + 'static,
{
    ensure_not_running(app, Some(modpack_id))?;
    let instance_dir = Path::new(base_path).join("instances").join(modpack_id);
    let existed = instance_dir.exists();

    let handle = {
        let state = app.state::<InstallState>();
        let mut current = state.0.lock().unwrap();
        if current.is_some() {
            return Err("Ya hay una instalación en curso".to_string());
        }
        let handle = tokio::spawn(task);
        *current = Some(handle.abort_handle());
        handle
    };

    let result = handle.await;

    let error = match result {
        Ok(Ok(())) => None,
        Ok(Err(e)) => Some(format!("{:#}", e)),
        Err(e) if e.is_cancelled() => Some(INSTALL_CANCELLED.to_string()),
        Err(e) => Some(e.to_string()),
    };

    if let Some(error) = &error {
        warn!("[commands::install] {} no se completó: {}", modpack_id, error);
        // Cancelar no detiene los hilos de disco: limpiar cuando hayan parado
        installer::extract::wait_idle().await;
        if existed {
            tokio::fs::remove_dir_all(instance_dir.join(installer::STAGING_DIR)).await.ok();
        } else {
            // Una instalación nueva a medias no debe parecer instalada
            tokio::fs::remove_dir_all(&instance_dir).await.ok();
        }
    }

    // Hasta aquí no se admite otra instalación: comparten archivos
    *app.state::<InstallState>().0.lock().unwrap() = None;
    error.map_or(Ok(()), Err)
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
    modpack_version: Option<String>,
) -> Result<(), String> {
    validate_modpack_id(&modpack_id)?;
    let task = installer::install(
        app.clone(),
        base_path.clone(),
        mc_version,
        loader,
        loader_version,
        overrides_url,
        mods_url,
        modpack_id.clone(),
        modpack_version,
    );
    run_cancellable_install(&app, &base_path, &modpack_id, task).await
}

#[tauri::command]
pub async fn update_modpack(
    app: AppHandle,
    base_path: String,
    overrides_url: String,
    mods_url: String,
    modpack_id: String,
    modpack_version: Option<String>,
) -> Result<(), String> {
    validate_modpack_id(&modpack_id)?;
    let task = installer::update(
        app.clone(),
        base_path.clone(),
        overrides_url,
        mods_url,
        modpack_id.clone(),
        modpack_version,
    );
    run_cancellable_install(&app, &base_path, &modpack_id, task).await
}

#[tauri::command]
pub fn cancel_install(state: State<'_, InstallState>) -> bool {
    match state.0.lock().unwrap().as_ref() {
        Some(handle) => {
            handle.abort();
            true
        }
        None => false,
    }
}

#[tauri::command]
pub fn is_modpack_installed(base_path: String, modpack_id: String) -> bool {
    if validate_modpack_id(&modpack_id).is_err() {
        return false;
    }
    let base = Path::new(&base_path);
    let instance_dir = base.join("instances").join(&modpack_id);
    let mods_dir = instance_dir.join("mods");
    let installed_version_file = instance_dir.join(installer::INSTALLED_VERSION_FILE);

    if !instance_dir.exists() || !mods_dir.exists() {
        return false;
    }

    match std::fs::read_to_string(&installed_version_file) {
        Ok(content) => !content.trim().is_empty(),
        Err(_) => false,
    }
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
    modpack_name: Option<String>,
    show_logs: Option<bool>,
    mc_version: String,
    loader: Option<String>,
    loader_version: String,
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

    // El launcher sustituye esta reserva por el PID real y emite
    // game_started/game_exited; aquí se evita el doble lanzamiento
    {
        let state = app.state::<RunningInstances>();
        let mut processes = state.processes.lock().unwrap();
        if processes.contains_key(&modpack_id) {
            return Err("Este modpack ya se está ejecutando".to_string());
        }
        processes.insert(modpack_id.clone(), 0);
    }

    let settings = LaunchSettings {
        min_ram_mb: min_ram_mb.unwrap_or(512),
        max_ram_mb: max_ram_mb.unwrap_or(4096),
        fullscreen: fullscreen.unwrap_or(false),
        window_width: window_width.unwrap_or(1280),
        window_height: window_height.unwrap_or(720),
        extra_jvm_args: extra_jvm_args.unwrap_or_default(),
    };

    let launched = launch(
        app.clone(),
        base_path,
        modpack_id.clone(),
        modpack_name.unwrap_or_else(|| modpack_id.clone()),
        mc_version,
        loader.unwrap_or_else(|| "forge".to_string()),
        loader_version,
        LaunchAuth::new(username, uuid, access_token),
        settings,
    )
    .await;

    if let Err(e) = launched {
        app.state::<RunningInstances>().processes.lock().unwrap().remove(&modpack_id);
        return Err(format!("{:#}", e));
    }

    if show_logs.unwrap_or(true) {
        // No poder abrir la ventana de logs no debe impedir jugar
        if let Err(e) = crate::game_logs::open_log_window(&app, &modpack_id) {
            warn!("[commands::launch_modpack] {}", e);
        }
    }
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
    info!("[commands::open_directory] Abriendo: {}", path);

    let dir = std::path::Path::new(&path);

    if !dir.exists() {
        warn!("[commands::open_directory] Directorio no existe: {}", path);
        return Err(format!("El directorio no existe: {}", path));
    }

    #[cfg(target_os = "windows")]
    let result = {
        let win_path = path.replace('/', "\\");
        info!("[commands::open_directory] win_path: {}", win_path);
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
            info!("[commands::open_directory] ✓ Abierto: {}", path);
            Ok(())
        }
        Err(e) => {
            error!("[commands::open_directory] Error abriendo {}: {}", path, e);
            Err(format!("No se pudo abrir el directorio: {}", e))
        }
    }
}

#[tauri::command]
pub async fn uninstall_modpack(app: AppHandle, base_path: String, modpack_id: String) -> Result<(), String> {
    validate_modpack_id(&modpack_id)?;
    ensure_not_running(&app, Some(&modpack_id))?;
    ensure_no_install(&app)?;
    info!(
        "[commands::uninstall_modpack] Desinstalando: {}",
        modpack_id
    );

    let base = std::path::Path::new(&base_path);
    let instance_dir = base.join("instances").join(&modpack_id);

    if !instance_dir.exists() {
        warn!(
            "[commands::uninstall_modpack] Instancia no encontrada: {:?}",
            instance_dir
        );
        return Err(format!("El modpack '{}' no está instalado", modpack_id));
    }

    tokio::fs::remove_dir_all(&instance_dir)
        .await
        .map_err(|e| {
            error!(
                "[commands::uninstall_modpack] Error eliminando {:?}: {}",
                instance_dir, e
            );
            format!("Error desinstalando el modpack: {}", e)
        })?;

    info!(
        "[commands::uninstall_modpack] ✓ Instancia eliminada: {:?}",
        instance_dir
    );
    Ok(())
}

#[tauri::command]
pub async fn clear_all_cache(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    ensure_not_running(&app, None)?;
    ensure_no_install(&app)?;
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;

    info!("[commands::clear_all_cache] Borrando: {:?}", base);

    for folder in &["instances", "versions", "libraries", "assets", "java"] {
        let path = base.join(folder);
        if path.exists() {
            tokio::fs::remove_dir_all(&path)
                .await
                .map_err(|e| format!("Error borrando {}: {}", folder, e))?;
            info!("[commands::clear_all_cache] Eliminado: {:?}", path);
        }
    }
    // Sin el almacén del sistema disponible no hay nada que impida seguir borrando
    if let Err(e) = crate::secrets::clear(&app).await {
        warn!("[commands::clear_all_cache] Tokens: {}", e);
    }
    Ok(())
}

#[tauri::command]
pub async fn restart_app(app: tauri::AppHandle) -> Result<(), String> {
    app.restart();
}

#[tauri::command]
pub async fn auth_microsoft(window: Window) -> Result<LoginCompleteResponse, String> {
    let ms_tokens = microsoft::login(window).await.map_err(|e| format!("{:#}", e))?;

    let client = installer::http::client();

    let xbox = xbox::authenticate(client, &ms_tokens.access_token)
        .await
        .map_err(|e| e.to_string())?;

    let profile = minecraft::authenticate(client, &xbox)
        .await
        .map_err(|e| e.to_string())?;

    let skin_head_base64 = if let Some(ref url) = profile.skin_url {
        skin::get_head_base64(url).await.ok()
    } else {
        None
    };
    info!(
        "[commands::auth_microsoft] ✓ Login completo: {} ({})",
        profile.username, profile.uuid
    );

    Ok(LoginCompleteResponse {
        uuid: profile.uuid,
        username: profile.username,
        access_token: profile.access_token,
        skin_head_base64,
        expires_in: profile.expires_in,
        refresh_token: ms_tokens.refresh_token,
    })
}

/// Deja de esperar el login en curso. Devuelve false si no había ninguno.
#[tauri::command]
pub fn cancel_login() -> bool {
    microsoft::cancel_login()
}

#[tauri::command]
pub async fn auth_refresh(refresh_token: String) -> Result<LoginCompleteResponse, String> {
    info!("[commands::auth_refresh] Renovando sesión...");
    let client = installer::http::client();

    let ms_tokens = crate::auth::microsoft::refresh_ms_token(client, &refresh_token)
        .await
        .map_err(|e| e.to_string())?;

    let xbox = crate::auth::xbox::authenticate(client, &ms_tokens.access_token)
        .await
        .map_err(|e| e.to_string())?;

    let profile = crate::auth::minecraft::authenticate(client, &xbox)
        .await
        .map_err(|e| e.to_string())?;

    let skin_head_base64 = if let Some(ref url) = profile.skin_url {
        crate::auth::skin::get_head_base64(url).await.ok()
    } else {
        None
    };

    Ok(LoginCompleteResponse {
        uuid: profile.uuid,
        username: profile.username,
        access_token: profile.access_token,
        refresh_token: ms_tokens.refresh_token,
        skin_head_base64,
        expires_in: profile.expires_in,
    })
}
