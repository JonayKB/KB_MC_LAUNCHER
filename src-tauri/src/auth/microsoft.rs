use anyhow::{Context, Result};
use axum::{extract::Query, response::Html, routing::get, Router};
use oauth2::{
    basic::BasicClient, AuthUrl, AuthorizationCode, ClientId, CsrfToken, PkceCodeChallenge,
    RedirectUrl, RefreshToken, Scope, TokenResponse, TokenUrl,
};
use std::collections::HashMap;
use tokio::sync::oneshot;

pub const CLIENT_ID: &str = "85d576e3-a3f9-41da-96f9-afdbe46cefc8";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

pub struct MicrosoftTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
}

fn to_tokens<T: TokenResponse>(token: &T) -> MicrosoftTokens {
    MicrosoftTokens {
        access_token: token.access_token().secret().to_string(),
        refresh_token: token.refresh_token().map(|t| t.secret().to_string()),
    }
}

pub async fn login() -> Result<MicrosoftTokens> {
    let client = BasicClient::new(ClientId::new(CLIENT_ID.to_string()))
        .set_auth_uri(AuthUrl::new(
            "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize".to_string(),
        )?)
        .set_token_uri(TokenUrl::new(TOKEN_URL.to_string())?)
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

    let server = tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });

    if let Err(e) = open::that(auth_url.as_str()) {
        server.abort();
        return Err(e.into());
    }

    // Liberar el puerto siempre, para permitir otro inicio de sesión después
    let code = tokio::time::timeout(std::time::Duration::from_secs(300), rx).await;
    server.abort();
    let code = code
        .context("Tiempo de espera agotado para el inicio de sesión")?
        .context("El inicio de sesión se canceló")?;

    let http_client = reqwest::Client::new();

    let token = client
        .exchange_code(AuthorizationCode::new(code))
        .set_pkce_verifier(verifier)
        .request_async(&http_client)
        .await
        .context("Error obteniendo token Microsoft")?;

    Ok(to_tokens(&token))
}

/// Obtiene un nuevo access token de Microsoft a partir del refresh token guardado
pub async fn refresh(refresh_token: &str) -> Result<MicrosoftTokens> {
    let client = BasicClient::new(ClientId::new(CLIENT_ID.to_string()))
        .set_token_uri(TokenUrl::new(TOKEN_URL.to_string())?);

    let http_client = reqwest::Client::new();

    let token = client
        .exchange_refresh_token(&RefreshToken::new(refresh_token.to_string()))
        .request_async(&http_client)
        .await
        .context("Error refrescando token Microsoft")?;

    let mut tokens = to_tokens(&token);
    // Microsoft puede no rotar el refresh token: conservar el anterior
    if tokens.refresh_token.is_none() {
        tokens.refresh_token = Some(refresh_token.to_string());
    }
    Ok(tokens)
}
