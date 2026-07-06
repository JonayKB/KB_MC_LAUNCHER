use anyhow::{Context, Result};

/// Descarga la skin y extrae la cabeza (8x8 px del área de la cara)
/// Devuelve los bytes de un PNG 8x8 (o escalado a 64x64 para mejor calidad)
pub async fn get_head_png(skin_url: &str) -> Result<Vec<u8>> {
    log::info!("[skin] Descargando skin desde: {}", skin_url);

    let bytes = reqwest::get(skin_url)
        .await
        .context("Error descargando skin")?
        .bytes()
        .await
        .context("Error leyendo bytes de la skin")?;

    log::info!("[skin] Skin descargada ({} bytes), extrayendo cabeza...", bytes.len());

    // La skin de Minecraft es 64x64 (o 64x32 en formato legacy)
    // La cara está en x=8, y=8, w=8, h=8 (capa base)
    let skin_img = image::load_from_memory(&bytes)
        .context("Error parseando imagen de skin")?
        .to_rgba8();

    // Extraer cara base (8x8 en coordenadas 8,8)
    let mut head = image::RgbaImage::new(8, 8);
    for y in 0..8u32 {
        for x in 0..8u32 {
            let pixel = skin_img.get_pixel(8 + x, 8 + y);
            head.put_pixel(x, y, *pixel);
        }
    }

    // Aplicar capa de sombrero si existe (x=40, y=8, w=8, h=8)
    // Solo si el pixel tiene alpha > 0
    for y in 0..8u32 {
        for x in 0..8u32 {
            let overlay = skin_img.get_pixel(40 + x, 8 + y);
            if overlay[3] > 0 {
                head.put_pixel(x, y, *overlay);
            }
        }
    }

    // Escalar a 64x64 con nearest neighbor (sin blur, estilo pixel art)
    let scaled = image::imageops::resize(
        &head,
        64, 64,
        image::imageops::FilterType::Nearest,
    );

    // Codificar como PNG
    let mut png_bytes: Vec<u8> = Vec::new();
    scaled.write_to(
        &mut std::io::Cursor::new(&mut png_bytes),
        image::ImageFormat::Png,
    ).context("Error codificando PNG de cabeza")?;

    log::info!("[skin] ✓ Cabeza extraída ({} bytes PNG)", png_bytes.len());
    Ok(png_bytes)
}

/// Devuelve la cabeza como base64 para pasarla al frontend
pub async fn get_head_base64(skin_url: &str) -> Result<String> {
    let png = get_head_png(skin_url).await?;
    Ok(format!("data:image/png;base64,{}", base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &png
    )))
}