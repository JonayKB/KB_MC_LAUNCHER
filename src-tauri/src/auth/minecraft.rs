use crate::auth::xbox::XboxTokens;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinecraftProfile {
    pub uuid: String,
    pub username: String,
    pub access_token: String,
    pub skin_url: Option<String>,
    pub expires_in: u64,
}

pub async fn authenticate(client: &reqwest::Client, xbox: &XboxTokens) -> Result<MinecraftProfile> {
    // ── 1. Token de Minecraft ─────────────────────────────────
    log::info!("[minecraft] Obteniendo token de Minecraft...");

    let mc_resp = client
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&json!({
            "identityToken": format!(
                "XBL3.0 x={};{}",
                xbox.user_hash,
                xbox.xsts_token
            )
        }))
        .send()
        .await
        .context("Error contactando Minecraft Services")?;

    let status = mc_resp.status();

    let body = mc_resp
        .text()
        .await
        .context("Error leyendo respuesta Minecraft")?;

    log::info!("[minecraft] status={} body={}", status, body);

    let mc_resp: serde_json::Value = serde_json::from_str(&body)?;

    let access_token = mc_resp["access_token"]
        .as_str()
        .context("access_token de Minecraft no encontrado")?
        .to_string();

    log::info!("[minecraft] ✓ Token de Minecraft obtenido");

    // ── 2. Verificar que tiene el juego ───────────────────────
    log::info!("[minecraft] Verificando propiedad del juego...");

    let entitlements: serde_json::Value = client
        .get("https://api.minecraftservices.com/entitlements/mcstore")
        .bearer_auth(&access_token)
        .send()
        .await
        .context("Error verificando entitlements")?
        .json()
        .await
        .context("Error parseando entitlements")?;

    let has_game = entitlements["items"]
        .as_array()
        .map(|items| {
            items.iter().any(|i| {
                i["name"].as_str() == Some("game_minecraft")
                    || i["name"].as_str() == Some("product_minecraft")
            })
        })
        .unwrap_or(false);

    if !has_game {
        log::warn!("[minecraft] La cuenta no tiene Minecraft comprado");
        anyhow::bail!("Esta cuenta de Microsoft no tiene Minecraft Java Edition comprado.");
    }

    log::info!("[minecraft] ✓ Propiedad del juego verificada");

    // ── 3. Obtener perfil ─────────────────────────────────────
    log::info!("[minecraft] Obteniendo perfil...");

    let profile: serde_json::Value = client
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(&access_token)
        .send()
        .await
        .context("Error obteniendo perfil")?
        .json()
        .await
        .context("Error parseando perfil")?;

    let uuid = profile["id"]
        .as_str()
        .context("UUID no encontrado")?
        .to_string();
    let username = profile["name"]
        .as_str()
        .context("Username no encontrado")?
        .to_string();

    // ── 4. Obtener URL de la skin ─────────────────────────────
    let skin_url = profile["skins"]
        .as_array()
        .and_then(|skins| skins.iter().find(|s| s["state"].as_str() == Some("ACTIVE")))
        .and_then(|skin| skin["url"].as_str())
        .map(|s| s.to_string());
    let expires_in = match mc_resp["expiresIn"].as_u64() {
        Some(v) => {
            log::info!(
                "[minecraft] expiresIn del token: {} segundos ({} horas)",
                v,
                v / 3600
            );
            v
        }
        None => {
            log::warn!("[minecraft] expiresIn no encontrado en la respuesta, usando fallback de 86400s (24h)");
            log::debug!("[minecraft] mc_resp completo: {}", mc_resp);
            86400
        }
    };
    log::info!(
        "[minecraft] ✓ Perfil obtenido — username: {} | uuid: {}",
        username,
        uuid
    );

    Ok(MinecraftProfile {
        uuid,
        username,
        access_token,
        skin_url,
        expires_in,
    })
}
