use anyhow::{Context, Result};
use axum::{extract::Query, response::Html, routing::get, Router};
use oauth2::{
    basic::BasicClient, AuthUrl, AuthorizationCode, ClientId, CsrfToken, PkceCodeChallenge,
    RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex, Mutex};
use std::time::Duration;
use tauri::Window;
use tokio::sync::oneshot;
use tracing::{info, warn};

pub struct MicrosoftTokens {
    pub access_token: String,
    pub refresh_token: String,
}
pub const CLIENT_ID: &str = "85d576e3-a3f9-41da-96f9-afdbe46cefc8";

/// Login en espera: al llegar otro o al cancelar, se abandona y libera el puerto
static ACTIVE_LOGIN: Mutex<Option<oneshot::Sender<()>>> = Mutex::new(None);

const CALLBACK_ADDR: &str = "127.0.0.1:47821";
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);
/// Mensaje de error que el frontend no muestra: lo ha pedido el propio usuario
pub const LOGIN_CANCELLED: &str = "LOGIN_CANCELLED";

/// Lo que el navegador trae de vuelta en `/callback`
enum Callback {
    Code(String),
    Denied(String),
}

pub fn cancel_login() -> bool {
    match ACTIVE_LOGIN.lock().unwrap().take() {
        Some(cancel) => cancel.send(()).is_ok(),
        None => false,
    }
}

fn result_page(title: &str, subtitle: &str, detail: &str) -> Html<String> {
    Html(
        CALLBACK_PAGE
            .replace("{{TITLE}}", title)
            .replace("{{SUBTITLE}}", subtitle)
            .replace("{{DETAIL}}", detail),
    )
}

/// Tras abandonar un login anterior el puerto tarda unos instantes en liberarse
async fn bind_callback() -> Result<tokio::net::TcpListener> {
    let mut attempt = 0;
    loop {
        match tokio::net::TcpListener::bind(CALLBACK_ADDR).await {
            Ok(listener) => return Ok(listener),
            Err(_) if attempt < 20 => {
                attempt += 1;
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            Err(e) => {
                return Err(e).context(format!(
                    "El puerto {} está ocupado por otro programa",
                    CALLBACK_ADDR
                ));
            }
        }
    }
}

/// Levanta `/callback`, abre el navegador y espera a que Microsoft redirija.
/// Una petición sin el `state` esperado se rechaza sin interrumpir el login.
async fn wait_for_code(
    expected_state: String,
    open_browser: impl FnOnce() -> Result<()>,
    timeout: Duration,
) -> Result<String> {
    // Solo un login a la vez: el anterior se abandona
    cancel_login();
    let listener = bind_callback().await?;

    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    *ACTIVE_LOGIN.lock().unwrap() = Some(cancel_tx);

    let (tx, rx) = oneshot::channel::<Callback>();
    let tx = Arc::new(StdMutex::new(Some(tx)));
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let shutdown_tx = Arc::new(StdMutex::new(Some(shutdown_tx)));

    let app = Router::new().route(
        "/callback",
        get(move |Query(params): Query<HashMap<String, String>>| {
            let tx = tx.clone();
            let shutdown_tx = shutdown_tx.clone();
            let expected_state = expected_state.clone();
            async move {
                if params.get("state") != Some(&expected_state) {
                    warn!("[microsoft] Callback con state incorrecto, se ignora");
                    return result_page(
                        "Petición no válida",
                        "No se ha iniciado sesión.",
                        "Esta página no procede del inicio de sesión del launcher.",
                    );
                }

                let (message, page) = match (params.get("code"), params.get("error")) {
                    (Some(code), _) => (
                        Callback::Code(code.clone()),
                        result_page(
                            "Login Completado",
                            "Sesión iniciada correctamente.",
                            "La autenticación ha finalizado con éxito. Ya puedes cerrar esta ventana de forma segura para volver a la aplicación.",
                        ),
                    ),
                    (None, error) => (
                        Callback::Denied(
                            params
                                .get("error_description")
                                .or(error)
                                .cloned()
                                .unwrap_or_else(|| "respuesta desconocida".to_string()),
                        ),
                        result_page(
                            "Login Cancelado",
                            "No se ha iniciado sesión.",
                            "Puedes cerrar esta ventana y volver a intentarlo desde el launcher.",
                        ),
                    ),
                };

                if let Some(sender) = tx.lock().unwrap().take() {
                    let _ = sender.send(message);
                }
                tokio::spawn(async move {
                    tokio::time::sleep(Duration::from_millis(100)).await;
                    if let Some(s) = shutdown_tx.lock().unwrap().take() {
                        let _ = s.send(());
                    }
                });
                page
            }
        }),
    );

    let mut server = tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
                info!("[microsoft] Servidor de callback cerrado");
            })
            .await
            .ok();
    });

    let mut answered = false;
    let outcome = async {
        open_browser()?;
        tokio::select! {
            callback = rx => {
                answered = true;
                match callback {
                    Ok(Callback::Code(code)) => Ok(code),
                    Ok(Callback::Denied(reason)) => {
                        info!("[microsoft] Login rechazado: {}", reason);
                        anyhow::bail!("Microsoft no completó el inicio de sesión: {}", reason)
                    }
                    Err(_) => anyhow::bail!("Error recibiendo código"),
                }
            }
            _ = cancel_rx => anyhow::bail!(LOGIN_CANCELLED),
            _ = tokio::time::sleep(timeout) => anyhow::bail!("Login timeout — no se completó en 5 minutos"),
        }
    }
    .await;

    // Con respuesta, dejar que la página llegue al navegador; después, en
    // cualquier caso, esperar a que el puerto quede libre
    let closed = answered
        && tokio::time::timeout(Duration::from_secs(1), &mut server).await.is_ok();
    if !closed {
        server.abort();
        let _ = server.await;
    }

    // Solo si sigue siendo el activo: uno nuevo pudo sustituirlo
    if let Ok(mut active) = ACTIVE_LOGIN.lock() {
        if active.as_ref().is_some_and(|cancel| cancel.is_closed()) {
            *active = None;
        }
    }
    outcome
}

pub async fn login(window: Window) -> Result<MicrosoftTokens> {
    let client = BasicClient::new(ClientId::new(CLIENT_ID.to_string()))
        .set_auth_uri(AuthUrl::new(
            "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize".to_string(),
        )?)
        .set_token_uri(TokenUrl::new(
            "https://login.microsoftonline.com/consumers/oauth2/v2.0/token".to_string(),
        )?)
        .set_redirect_uri(RedirectUrl::new(format!("http://{}/callback", CALLBACK_ADDR))?);

    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();

    let (auth_url, state) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("XboxLive.signin".into()))
        .add_scope(Scope::new("offline_access".into()))
        .set_pkce_challenge(challenge)
        .url();

    let code = wait_for_code(
        state.secret().clone(),
        || open::that(auth_url.as_str()).map_err(Into::into),
        LOGIN_TIMEOUT,
    )
    .await?;

    // oauth2 pide un cliente sin redirecciones para el intercambio de tokens
    let http_client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()?;

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

    info!("[microsoft] ✓ access_token y refresh_token obtenidos");

    if let Err(e) = window.set_focus() {
        warn!("[tauri] No se pudo enfocar la ventana: {:?}", e);
    }

    Ok(MicrosoftTokens {
        access_token,
        refresh_token,
    })
}

const CALLBACK_PAGE: &str = r#"
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{TITLE}}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500&family=Barlow+Condensed:wght@700;800&display=swap" rel="stylesheet">
    
    <style>
        :root {
        /* Por defecto aplicamos tu tema Oscuro (Dark) */
        --bg-base: #080809;
        --bg-surface: #101013;
        --bg-elevated: #18181c;
        --bg-hover: #1e1e24;

        --border: #2a2a32;
        --border-strong: #3a3a48;

        --text-primary: #f5f5f7;
        --text-secondary: #d0d0da;
        --text-muted: #9898a8;
        --text-faint: #52525e;

        --accent: #E8192C;
        --accent-hover: #B01020;
        --accent-dim: #2a0a0e;
        --accent-border: #3a1018;

        --success: #22c55e;
        --warning: #f59e0b;
        --error-text: #fca5a5;

        --radius-sm: 4px;
        --radius-md: 6px;
        --radius-lg: 8px;
        --radius-xl: 10px;

        --font-body: "Barlow", system-ui, sans-serif;
        --font-condensed: "Barlow Condensed", system-ui, sans-serif;
    }

    /* Si el navegador/sistema del usuario está en modo Claro, cambiamos las variables */
    @media (prefers-color-scheme: light) {
        :root {
            --bg-base: #f0f0f2;
            --bg-surface: #ffffff;
            --bg-elevated: #f5f5f7;
            --bg-hover: #ebebef;

            --border: #d4d4dc;
            --border-strong: #b8b8c4;

            --text-primary: #0a0a0f;
            --text-secondary: #2a2a38;
            --text-muted: #5a5a70;
            --text-faint: #9898a8;

            --accent: #E8192C;
            --accent-hover: #B01020;
            --accent-dim: #fde8ea;
            --accent-border: #f5b8be;

            --success: #16a34a;
            --warning: #d97706;
            --error-text: #b91c1c;
        }
    }

    /* Reset mínimo necesario para que el body use las variables anteriores */
    *, *::before, *::after {
        box-sizing: border-box;
    }
        body {
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background-color: var(--bg-base);
            color: var(--text-primary);
            font-family: var(--font-body);
            padding: 24px;
            box-sizing: border-box;
            overflow: hidden;
            -webkit-font-smoothing: antialiased;
        }

        /* Contenedor principal - Basado en tu layout.card */
        .card {
            width: 100%;
            max-width: 440px;
            background-color: var(--bg-surface);
            border-radius: var(--radius-xl);
            padding: 32px;
            border: 1px solid var(--border);
            border-top: 2px solid var(--accent);
            display: flex;
            flex-direction: column;
            gap: 22px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
            box-sizing: border-box;
        }

        /* Zona superior identificativa - Basado en tu logo.wrap */
        .logo-zone {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-family: var(--font-condensed);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.15em;
        }
        .logo-accent { color: var(--accent); }
        .logo-muted { color: var(--text-faint); }

        /* Zona del encabezado - Basado en tu header.zone */
        .header-zone {
            text-align: center;
        }
        .icon-wrap {
            width: 44px;
            height: 44px;
            border-radius: var(--radius-lg);
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 14px;
        }
        .title {
            font-family: var(--font-condensed);
            font-size: 24px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.02em;
            color: var(--text-primary);
            margin: 0 0 6px;
        }
        .subtitle {
            font-size: 16px;
            color: var(--text-muted);
            margin: 0;
        }

        /* Barra de progreso de carga - Basado en tu progress y timings */
        .progress-track {
            height: 6px;
            background-color: var(--bg-hover);
            border-radius: 3px;
            overflow: hidden;
            width: 100%;
        }
        .progress-bar {
            height: 100%;
            background: var(--accent);
            border-radius: 3px;
            width: 0%;
            transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* Bloque informativo - Basado en tu box.status y text.status */
        .status-box {
            background-color: var(--bg-elevated);
            border-top: 1px solid var(--border);
            border-right: 1px solid var(--border);
            border-bottom: 1px solid var(--border);
            border-left: 3px solid var(--accent);
            border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
            padding: 14px 16px;
            font-size: 14px;
            color: var(--text-secondary);
            line-height: 1.5;
        }

        /* Botón de cierre - Basado en tu btn.primary */
        .btn-primary {
            width: 100%;
            padding: 11px;
            border-radius: var(--radius-md);
            font-family: var(--font-condensed);
            font-size: 14px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            cursor: pointer;
            border: none;
            background-color: var(--accent);
            color: #ffffff;
            transition: background-color 0.15s;
        }
        .btn-primary:hover {
            background-color: var(--accent-hover);
        }
    </style>
</head>
<body>

    <div class="card">
        <div class="logo-zone">
            <span class="logo-accent">MICROSOFT</span>
            <span class="logo-muted">•</span>
            <span class="logo-muted">OAUTH</span>
        </div>

        <div class="header-zone">
            <div class="icon-wrap">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </div>
            <h1 class="title">{{TITLE}}</h1>
            <p class="subtitle">{{SUBTITLE}}</p>
        </div>

        <div class="progress-track">
            <div id="pBar" class="progress-bar"></div>
        </div>

        <div class="status-box">
            {{DETAIL}}
        </div>

        <button class="btn-primary" onclick="window.close()">
            Cerrar Ventana
        </button>
    </div>

    <script>
        // Disparamos la animación de la barra al renderizar
        window.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                document.getElementById('pBar').style.width = '100%';
            }, 100);
        });
    </script>
</body>
</html>
"#;

pub async fn refresh_ms_token(
    client: &reqwest::Client,
    refresh_token: &str,
) -> Result<MicrosoftTokens> {
    info!("[microsoft] Renovando token con refresh_token...");

    let resp = client
        .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
        .timeout(Duration::from_secs(30))
        .form(&[
            ("client_id", CLIENT_ID),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("scope", "XboxLive.signin offline_access"),
        ])
        .send()
        .await
        .context("Error renovando token")?;

    let status = resp.status();
    let body = resp.text().await.context("Error leyendo respuesta")?;

    if !status.is_success() {
        anyhow::bail!("Error renovando token MS: {}", body);
    }

    let json: serde_json::Value =
        serde_json::from_str(&body).context("Error parseando token renovado")?;

    let access_token = json["access_token"]
        .as_str()
        .context("access_token no encontrado")?
        .to_string();
    // Microsoft no siempre rota el refresh token: si no llega, se conserva el anterior
    let refresh_token = json["refresh_token"]
        .as_str()
        .unwrap_or(refresh_token)
        .to_string();

    info!("[microsoft] ✓ Token renovado");
    Ok(MicrosoftTokens {
        access_token,
        refresh_token,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::Mutex as AsyncMutex;

    /// El puerto de callback es fijo: estas pruebas no pueden solaparse
    static PORT: AsyncMutex<()> = AsyncMutex::const_new(());

    fn callback_url(query: &str) -> String {
        format!("http://{}/callback?{}", CALLBACK_ADDR, query)
    }

    async fn page(query: &str) -> String {
        reqwest::get(callback_url(query)).await.unwrap().text().await.unwrap()
    }

    fn start(state: &str) -> tokio::task::JoinHandle<Result<String>> {
        let state = state.to_string();
        tokio::spawn(wait_for_code(state, || Ok(()), Duration::from_secs(5)))
    }

    /// Espera a que el servidor de callback esté escuchando
    async fn wait_listening() {
        for _ in 0..100 {
            if tokio::net::TcpStream::connect(CALLBACK_ADDR).await.is_ok() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        panic!("el servidor de callback no arrancó");
    }

    #[tokio::test]
    async fn code_with_the_right_state_completes_the_login() {
        let _port = PORT.lock().await;
        let login = start("abc");
        wait_listening().await;
        assert!(page("code=c1&state=abc").await.contains("Login Completado"));
        assert_eq!(login.await.unwrap().unwrap(), "c1");
    }

    #[tokio::test]
    async fn cancelling_in_the_browser_is_not_reported_as_success() {
        let _port = PORT.lock().await;
        let login = start("abc");
        wait_listening().await;
        let body = page("error=access_denied&error_description=denegado&state=abc").await;
        assert!(body.contains("Login Cancelado") && !body.contains("Login Completado"));
        let error = login.await.unwrap().unwrap_err().to_string();
        assert!(error.contains("denegado"), "{}", error);
    }

    #[tokio::test]
    async fn wrong_state_is_rejected_and_the_login_keeps_waiting() {
        let _port = PORT.lock().await;
        let login = start("abc");
        wait_listening().await;
        let body = page("code=malo&state=otro").await;
        assert!(body.contains("Petición no válida"));
        assert!(page("code=malo").await.contains("Petición no válida"));
        assert!(page("code=bueno&state=abc").await.contains("Login Completado"));
        assert_eq!(login.await.unwrap().unwrap(), "bueno");
    }

    #[tokio::test]
    async fn cancel_frees_the_port_for_a_new_login() {
        let _port = PORT.lock().await;
        for round in 0..3 {
            let login = start("abc");
            wait_listening().await;
            assert!(cancel_login());
            assert_eq!(login.await.unwrap().unwrap_err().to_string(), LOGIN_CANCELLED);
            let again = start("xyz");
            wait_listening().await;
            assert!(page(&format!("code=r{round}&state=xyz")).await.contains("Login Completado"));
            assert_eq!(again.await.unwrap().unwrap(), format!("r{round}"));
            tokio::time::sleep(Duration::from_millis(150)).await;
        }
    }

    #[tokio::test]
    async fn a_second_login_replaces_the_first() {
        let _port = PORT.lock().await;
        let first = start("uno");
        wait_listening().await;
        let second = start("dos");
        assert_eq!(first.await.unwrap().unwrap_err().to_string(), LOGIN_CANCELLED);
        wait_listening().await;
        assert!(page("code=c&state=dos").await.contains("Login Completado"));
        assert_eq!(second.await.unwrap().unwrap(), "c");
    }

    #[tokio::test]
    async fn failing_to_open_the_browser_frees_the_port() {
        let _port = PORT.lock().await;
        let result = wait_for_code("a".into(), || anyhow::bail!("sin navegador"), Duration::from_secs(5)).await;
        assert!(result.unwrap_err().to_string().contains("sin navegador"));
        tokio::net::TcpListener::bind(CALLBACK_ADDR).await.unwrap();
    }
}
