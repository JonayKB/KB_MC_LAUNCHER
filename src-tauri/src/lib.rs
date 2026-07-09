use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
mod commands;
mod installer;
mod launcher;
mod auth;
mod logging;
use std::collections::HashMap;
use std::sync::Mutex;

use crate::logging::init_logging;
#[derive(Default)]
pub struct RunningInstances {
    pub processes: Mutex<HashMap<String, u32>>, // modpack_id -> pid
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            let open_item = MenuItem::with_id(app, "open", "Abrir", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            let window = app.get_webview_window("main").unwrap();
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window_clone.hide();
                }
            });

            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        
        .invoke_handler(tauri::generate_handler![
            commands::install_modpack,
            commands::fetch_text,
            commands::get_base_path,
            commands::is_modpack_installed,
            commands::launch_modpack,
            commands::open_directory,
            commands::uninstall_modpack,
            commands::get_recommended_settings,
            commands::clear_all_cache,
            commands::restart_app,
            commands::auth_microsoft,
            commands::auth_refresh,
            commands::update_modpack,
            commands::check_needs_update,
            commands::is_modpack_running,
        ])
        .manage(RunningInstances::default())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
