use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn download_mod_file(
    app: AppHandle,
    url: String,
    file_name: String,
    instance_name: String,
) -> Result<(), String> {
    let mods_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("instances")
        .join(&instance_name)
        .join("mods");

    tokio::fs::create_dir_all(&mods_dir)
        .await
        .map_err(|e| e.to_string())?;

    let bytes = reqwest::get(&url)
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    tokio::fs::write(mods_dir.join(&file_name), &bytes)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn extract_overrides(
    app: AppHandle,
    zip_bytes: Vec<u8>,
    instance_name: String,
) -> Result<(), String> {
    let instance_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("instances")
        .join(&instance_name);

    // Extraer todo síncronamente antes de cualquier await
    let entries: Vec<(String, Vec<u8>)> = {
        use std::io::{Cursor, Read};
        let mut archive =
            zip::ZipArchive::new(Cursor::new(zip_bytes)).map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let name = file.name().to_string();

            if !name.starts_with("overrides/") {
                continue;
            }
            let relative = name.trim_start_matches("overrides/").to_string();
            if relative.is_empty() {
                continue;
            }

            let mut buf = Vec::new();
            file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            result.push((relative, buf));
        }
        result
    }; // ZipFile y ZipArchive mueren aquí, antes del primer await

    // Ahora sí podemos hacer awaits
    for (relative, buf) in entries {
        let out_path = instance_dir.join(&relative);

        if buf.is_empty() && relative.ends_with('/') {
            tokio::fs::create_dir_all(&out_path)
                .await
                .map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = out_path.parent() {
                tokio::fs::create_dir_all(p)
                    .await
                    .map_err(|e| e.to_string())?;
            }
            tokio::fs::write(&out_path, buf)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
