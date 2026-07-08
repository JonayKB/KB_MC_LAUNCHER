use anyhow::{Context, Result};
use axum::{extract::Query, response::Html, routing::get, Router};
use oauth2::{
    basic::BasicClient, AuthUrl, AuthorizationCode, ClientId, CsrfToken, PkceCodeChallenge,
    RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use std::collections::HashMap;
use tokio::sync::oneshot;
pub struct MicrosoftTokens {
    pub access_token: String,
    pub refresh_token: String,
}
pub const CLIENT_ID: &str = "85d576e3-a3f9-41da-96f9-afdbe46cefc8";

pub async fn login() -> Result<MicrosoftTokens> {
    let client = BasicClient::new(ClientId::new(CLIENT_ID.to_string()))
        .set_auth_uri(AuthUrl::new(
            "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize".to_string(),
        )?)
        .set_token_uri(TokenUrl::new(
            "https://login.microsoftonline.com/consumers/oauth2/v2.0/token".to_string(),
        )?)
        .set_redirect_uri(RedirectUrl::new(
            "http://127.0.0.1:47821/callback".to_string(),
        )?);

    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();

    let (auth_url, _) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("XboxLive.signin".into()))
        .add_scope(Scope::new("offline_access".into()))
        .set_pkce_challenge(challenge)
        .url();

    let (tx, rx) = oneshot::channel::<String>();

    let tx = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));

    let app = Router::new().route(
        "/callback",
        get(move |Query(params): Query<HashMap<String, String>>| {
            let tx = tx.clone();

            async move {
                if let Some(code) = params.get("code") {
                    if let Some(sender) = tx.lock().unwrap().take() {
                        let _ = sender.send(code.clone());
                    }
                }

                Html(
                    "<h1>Login completado</h1>\
                     Puedes cerrar esta ventana.",
                )
            }
        }),
    );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:47821").await?;

    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });

    open::that(auth_url.as_str())?;

    let code = rx.await?;

    let http_client = reqwest::Client::new();

    let token = client
        .exchange_code(AuthorizationCode::new(code))
        .set_pkce_verifier(verifier)
        .request_async(&http_client)
        .await
        .context("Error obteniendo token Microsoft")?;

    let access_token = token.access_token().secret().to_string();
    let refresh_token = token
        .refresh_token()
        .map(|t| t.secret().to_string())
        .context(
            "Microsoft no devolvió refresh_token — asegúrate de tener el scope offline_access",
        )?;

    log::info!("[microsoft] ✓ access_token y refresh_token obtenidos");

    Ok(MicrosoftTokens {
        access_token,
        refresh_token,
    })
}

pub async fn refresh_ms_token(
    client: &reqwest::Client,
    refresh_token: &str,
) -> Result<MicrosoftTokens> {
    log::info!("[microsoft] Renovando token con refresh_token...");

    let resp = client
        .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
        .form(&[
            ("client_id",     CLIENT_ID),
            ("grant_type",    "refresh_token"),
            ("refresh_token", refresh_token),
            ("scope",         "XboxLive.signin offline_access"),
        ])
        .send()
        .await
        .context("Error renovando token")?;

    let status = resp.status();
    let body = resp.text().await.context("Error leyendo respuesta")?;
    log::info!("[microsoft] refresh status: {} | body: {}", status, body);

    if !status.is_success() {
        anyhow::bail!("Error renovando token MS: {}", body);
    }

    let json: serde_json::Value = serde_json::from_str(&body)
        .context("Error parseando token renovado")?;

    let access_token = json["access_token"]
        .as_str().context("access_token no encontrado")?.to_string();
    let refresh_token = json["refresh_token"]
        .as_str().context("refresh_token no encontrado")?.to_string();

    log::info!("[microsoft] ✓ Token renovado");
    Ok(MicrosoftTokens { access_token, refresh_token })
}