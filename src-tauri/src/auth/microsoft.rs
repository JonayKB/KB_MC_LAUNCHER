use anyhow::{Context, Result};
use axum::{extract::Query, response::Html, routing::get, Router};
use oauth2::{
    basic::BasicClient, AuthUrl, AuthorizationCode, ClientId, CsrfToken, PkceCodeChallenge,
    RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use tauri::{Window, window};
use std::collections::HashMap;
use tokio::sync::oneshot;
pub struct MicrosoftTokens {
    pub access_token: String,
    pub refresh_token: String,
}
pub const CLIENT_ID: &str = "85d576e3-a3f9-41da-96f9-afdbe46cefc8";

pub async fn login(window: Window) -> Result<MicrosoftTokens> {
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
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let shutdown_tx = std::sync::Arc::new(std::sync::Mutex::new(Some(shutdown_tx)));

    let app = Router::new().route(
        "/callback",
        get(move |Query(params): Query<HashMap<String, String>>| {
            let tx = tx.clone();
            let shutdown_tx = shutdown_tx.clone();
            async move {
                if let Some(code) = params.get("code") {
                    if let Some(sender) = tx.lock().unwrap().take() {
                        let _ = sender.send(code.clone());
                    }
                }
                tokio::spawn(async move {
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    if let Some(s) = shutdown_tx.lock().unwrap().take() {
                        let _ = s.send(());
                    }
                });
                // Reemplaza tu actual bloque Html(...) por este:
Html(r#"
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Autenticación Completada</title>
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
            <h1 class="title">Login Completado</h1>
            <p class="subtitle">Sesión iniciada correctamente.</p>
        </div>

        <div class="progress-track">
            <div id="pBar" class="progress-bar"></div>
        </div>

        <div class="status-box">
            La autenticación ha finalizado con éxito. Ya puedes cerrar esta ventana de forma segura para volver a la aplicación.
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
"#)
            }
        }),
    );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:47821").await?;

    tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
                log::info!("[microsoft] Servidor de callback cerrado");
            })
            .await
            .ok();
    });

    open::that(auth_url.as_str())?;

    let code = tokio::time::timeout(tokio::time::Duration::from_secs(300), rx)
        .await
        .context("Login timeout — no se completó en 5 minutos")?
        .context("Error recibiendo código")?;

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

    if let Err(e) = window.set_focus() {
    log::warn!("[tauri] No se pudo enfocar la ventana: {:?}", e);
}

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
    log::info!("[microsoft] refresh status: {} | body: {}", status, body);

    if !status.is_success() {
        anyhow::bail!("Error renovando token MS: {}", body);
    }

    let json: serde_json::Value =
        serde_json::from_str(&body).context("Error parseando token renovado")?;

    let access_token = json["access_token"]
        .as_str()
        .context("access_token no encontrado")?
        .to_string();
    let refresh_token = json["refresh_token"]
        .as_str()
        .context("refresh_token no encontrado")?
        .to_string();

    log::info!("[microsoft] ✓ Token renovado");
    Ok(MicrosoftTokens {
        access_token,
        refresh_token,
    })
}
