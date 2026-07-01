use tauri::AppHandle;
use tauri::Manager;
use crate::installer;
use std::path::Path;
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
) -> Result<(), String> {
    crate::launcher::launch(base_path, modpack_id, mc_version, forge_version, username)
        .await
        .map_err(|e| e.to_string())
}