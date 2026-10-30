use anyhow::{Context, Result};
use serde::de::DeserializeOwned;
use std::sync::LazyLock;
use std::time::Duration;

/// Límite de una petición corta (JSON, manifiestos...); las descargas grandes
/// no lo usan porque pueden tardar lo que haga falta mientras sigan llegando datos
const SHORT_REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

/// Cliente compartido: reutiliza conexiones entre los miles de archivos de una
/// instalación y evita que una conexión colgada bloquee la descarga para siempre.
static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent("kb-mc-launcher")
        .connect_timeout(Duration::from_secs(20))
        .read_timeout(Duration::from_secs(60))
        .build()
        .expect("no se pudo crear el cliente HTTP")
});

pub fn client() -> &'static reqwest::Client {
    &CLIENT
}

pub async fn get_text(url: &str) -> Result<String> {
    client()
        .get(url)
        .timeout(SHORT_REQUEST_TIMEOUT)
        .send()
        .await
        .with_context(|| format!("Error contactando con {}", url))?
        .error_for_status()
        .with_context(|| format!("Respuesta de error de {}", url))?
        .text()
        .await
        .with_context(|| format!("Error leyendo la respuesta de {}", url))
}

pub async fn get_json<T: DeserializeOwned>(url: &str) -> Result<T> {
    let text = get_text(url).await?;
    serde_json::from_str(&text).with_context(|| format!("Respuesta inválida de {}", url))
}
