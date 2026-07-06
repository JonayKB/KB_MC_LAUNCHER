use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

// Permisos: XboxLive.signin, XboxLive.offline_access
pub const CLIENT_ID: &str = "85d576e3-a3f9-41da-96f9-afdbe46cefc8";

#[derive(Debug, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: u64,
}

#[derive(Debug, Deserialize)]
struct TokenError {
    error: String,
}

pub async fn get_device_code(client: &reqwest::Client) -> Result<DeviceCodeResponse> {
    log::info!("[microsoft] Solicitando device code...");

    let resp = client
        .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode")
        .form(&[
            ("client_id", CLIENT_ID),
            ("scope", "XboxLive.signin XboxLive.offline_access offline_access"),
        ])
        .send()
        .await
        .context("Error contactando Microsoft")?
        .json::<DeviceCodeResponse>()
        .await
        .context("Error parseando device code")?;

    log::info!("[microsoft] Device code obtenido — user_code: {}", resp.user_code);
    Ok(resp)
}

pub async fn poll_token(
    client: &reqwest::Client,
    device_code: &str,
    interval_secs: u64,
) -> Result<TokenResponse> {
    log::info!("[microsoft] Esperando autorización del usuario...");

    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(interval_secs)).await;

        let resp = client
            .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
            .form(&[
                ("client_id",   CLIENT_ID),
                ("grant_type",  "urn:ietf:params:oauth:grant-type:device_code"),
                ("device_code", device_code),
            ])
            .send()
            .await
            .context("Error en polling de token")?;

        let status = resp.status();
        let body = resp.text().await.context("Error leyendo respuesta")?;

        if status.is_success() {
            let token: TokenResponse = serde_json::from_str(&body)
                .context("Error parseando token de Microsoft")?;
            log::info!("[microsoft] ✓ Token de Microsoft obtenido");
            return Ok(token);
        }

        // Comprobar el tipo de error
        let err: TokenError = serde_json::from_str(&body)
            .unwrap_or(TokenError { error: "unknown".into() });

        match err.error.as_str() {
            "authorization_pending" => {
                log::debug!("[microsoft] Esperando autorización...");
                continue;
            }
            "slow_down" => {
                log::debug!("[microsoft] Slow down — esperando más...");
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                continue;
            }
            "authorization_declined" => anyhow::bail!("El usuario rechazó la autorización"),
            "expired_token"          => anyhow::bail!("El código expiró, inténtalo de nuevo"),
            other => anyhow::bail!("Error de Microsoft: {}", other),
        }
    }
}