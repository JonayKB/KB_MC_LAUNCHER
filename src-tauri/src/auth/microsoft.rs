use anyhow::{Context, Result};
use axum::{extract::Query, response::Html, routing::get, Router};
use oauth2::{
    basic::BasicClient, AuthUrl, AuthorizationCode, ClientId, CsrfToken, PkceCodeChallenge,
    RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use std::collections::HashMap;
use tokio::sync::oneshot;

pub const CLIENT_ID: &str = "85d576e3-a3f9-41da-96f9-afdbe46cefc8";

pub async fn login() -> Result<String> {
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

    Ok(token.access_token().secret().to_string())
}
