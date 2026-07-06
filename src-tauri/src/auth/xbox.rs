use anyhow::{Context, Result};
use serde_json::json;

#[derive(Debug)]
pub struct XboxTokens {
    pub xbl_token: String,
    pub xsts_token: String,
    pub user_hash: String,
}

pub async fn authenticate(client: &reqwest::Client, ms_access_token: &str) -> Result<XboxTokens> {
    // ── 1. Xbox Live ──────────────────────────────────────────
    log::info!("[xbox] Autenticando con Xbox Live...");

    let xbl_resp: serde_json::Value = client
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={}", ms_access_token)
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }))
        .send()
        .await
        .context("Error contactando Xbox Live")?
        .json()
        .await
        .context("Error parseando respuesta XBL")?;

    let xbl_token = xbl_resp["Token"]
        .as_str()
        .context("Token XBL no encontrado")?
        .to_string();

    let user_hash = xbl_resp["DisplayClaims"]["xui"][0]["uhs"]
        .as_str()
        .context("UserHash XBL no encontrado")?
        .to_string();

    log::info!("[xbox] ✓ Token XBL obtenido");

    // ── 2. XSTS ───────────────────────────────────────────────
    log::info!("[xbox] Obteniendo token XSTS...");

    let xsts_resp = client
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&json!({
            "Properties": {
                "SandboxId": "RETAIL",
                "UserTokens": [xbl_token]
            },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }))
        .send()
        .await
        .context("Error contactando XSTS")?;

    let xsts_status = xsts_resp.status();
    let xsts_body: serde_json::Value = xsts_resp
        .json()
        .await
        .context("Error parseando respuesta XSTS")?;

    if !xsts_status.is_success() {
        let xerr = xsts_body["XErr"].as_u64().unwrap_or(0);
        let msg = match xerr {
            2148916233 => "La cuenta Microsoft no tiene cuenta Xbox. Ve a xbox.com para crearla.",
            2148916235 => "Xbox Live no está disponible en tu región.",
            2148916236 | 2148916237 => "La cuenta necesita verificación de adulto en Xbox.",
            2148916238 => "La cuenta es de menor de edad y necesita cuenta familiar.",
            _ => "Error desconocido de XSTS",
        };
        anyhow::bail!("Error XSTS ({}): {}", xerr, msg);
    }

    let xsts_token = xsts_body["Token"]
        .as_str()
        .context("Token XSTS no encontrado")?
        .to_string();

    log::info!("[xbox] ✓ Token XSTS obtenido");

    Ok(XboxTokens {
        xbl_token,
        xsts_token,
        user_hash,
    })
}
