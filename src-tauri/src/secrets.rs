//! Tokens de las cuentas de Microsoft, cifrados en disco.
//!
//! El almacén del sistema (Administrador de credenciales, Secret Service) solo
//! guarda una clave aleatoria: los tokens no caben siempre en él (Windows limita
//! cada entrada a 2,5 KB) y van en un archivo cifrado con AES-256-GCM.

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use anyhow::{anyhow, bail, Context, Result};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tracing::warn;

const SERVICE: &str = "com.jonaykb.kb-mc-launcher";
const KEY_ENTRY: &str = "tokens-key";
const VAULT_FILE: &str = "tokens.vault";
const NONCE_LEN: usize = 12;
/// El almacén del sistema puede quedarse esperando a que se desbloquee
const KEYRING_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountTokens {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
}

/// uuid de la cuenta → sus tokens
pub type Tokens = HashMap<String, AccountTokens>;

/// Dónde está la clave: el almacén del sistema, o memoria en los tests
pub trait KeyStore {
    /// `Ok(None)` si no existe; `Err` si ahora mismo no se puede consultar
    fn get(&self) -> Result<Option<String>>;
    fn set(&self, key: &str) -> Result<()>;
    fn delete(&self) -> Result<()>;
}

struct SystemKeyStore {
    entry: &'static str,
}

impl SystemKeyStore {
    fn entry(&self) -> Result<keyring::Entry> {
        keyring::Entry::new(SERVICE, self.entry).context("No se pudo abrir el almacén del sistema")
    }
}

impl KeyStore for SystemKeyStore {
    fn get(&self) -> Result<Option<String>> {
        match self.entry()?.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e).context("No se pudo leer el almacén del sistema"),
        }
    }

    fn set(&self, key: &str) -> Result<()> {
        self.entry()?.set_password(key).context("No se pudo escribir en el almacén del sistema")
    }

    fn delete(&self) -> Result<()> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e).context("No se pudo borrar del almacén del sistema"),
        }
    }
}

fn parse_key(encoded: &str) -> Result<Key<Aes256Gcm>> {
    let bytes = STANDARD.decode(encoded).context("Clave inválida")?;
    if bytes.len() != 32 {
        bail!("Clave de tamaño inválido");
    }
    Ok(*Key::<Aes256Gcm>::from_slice(&bytes))
}

fn encrypt(key: &Key<Aes256Gcm>, tokens: &Tokens) -> Result<Vec<u8>> {
    let plain = serde_json::to_vec(tokens)?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let cipher = Aes256Gcm::new(key)
        .encrypt(&nonce, plain.as_slice())
        .map_err(|_| anyhow!("No se pudieron cifrar los tokens"))?;
    let mut out = nonce.to_vec();
    out.extend(cipher);
    Ok(out)
}

fn decrypt(key: &Key<Aes256Gcm>, data: &[u8]) -> Result<Tokens> {
    if data.len() < NONCE_LEN {
        bail!("Archivo de tokens truncado");
    }
    let (nonce, cipher) = data.split_at(NONCE_LEN);
    let plain = Aes256Gcm::new(key)
        .decrypt(Nonce::from_slice(nonce), cipher)
        .map_err(|_| anyhow!("No se pudieron descifrar los tokens"))?;
    serde_json::from_slice(&plain).context("Contenido de tokens inválido")
}

/// Escribe a un temporal y renombra: un corte nunca deja el archivo a medias
fn write_atomic(path: &Path, data: &[u8]) -> Result<()> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, data)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600))?;
    }
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// `Err` solo si el almacén no responde ahora: los tokens siguen ahí y no hay
/// que dar la sesión por perdida. Si la clave ya no existe o el archivo no se
/// puede descifrar, se descarta: nunca se podrá recuperar.
pub fn load_tokens(store: &dyn KeyStore, vault: &Path) -> Result<Tokens> {
    if !vault.exists() {
        return Ok(Tokens::new());
    }
    let Some(encoded) = store.get()? else {
        warn!("[secrets] El archivo de tokens no tiene clave: se descarta");
        std::fs::remove_file(vault).ok();
        return Ok(Tokens::new());
    };
    let data = std::fs::read(vault)?;
    match parse_key(&encoded).and_then(|key| decrypt(&key, &data)) {
        Ok(tokens) => Ok(tokens),
        Err(e) => {
            warn!("[secrets] Tokens ilegibles, se descartan: {:#}", e);
            std::fs::remove_file(vault).ok();
            Ok(Tokens::new())
        }
    }
}

pub fn save_tokens(store: &dyn KeyStore, vault: &Path, tokens: &Tokens) -> Result<()> {
    if tokens.is_empty() {
        if vault.exists() {
            std::fs::remove_file(vault)?;
        }
        return Ok(());
    }
    let key = match store.get()?.map(|encoded| parse_key(&encoded)) {
        Some(Ok(key)) => key,
        _ => {
            let key = Aes256Gcm::generate_key(OsRng);
            store.set(&STANDARD.encode(key))?;
            key
        }
    };
    write_atomic(vault, &encrypt(&key, tokens)?)
}

fn vault_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(VAULT_FILE))
}

/// El almacén del sistema puede bloquearse: en un hilo aparte y con límite de tiempo
async fn with_keyring<T: Send + 'static>(
    work: impl FnOnce(&SystemKeyStore) -> Result<T> + Send + 'static,
) -> Result<T, String> {
    let task = tokio::task::spawn_blocking(move || work(&SystemKeyStore { entry: KEY_ENTRY }));
    match tokio::time::timeout(KEYRING_TIMEOUT, task).await {
        Ok(Ok(result)) => result.map_err(|e| format!("{:#}", e)),
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Err("El almacén seguro del sistema no responde".to_string()),
    }
}

#[tauri::command]
pub async fn tokens_load(app: AppHandle) -> Result<Tokens, String> {
    let vault = vault_path(&app)?;
    with_keyring(move |store| load_tokens(store, &vault)).await
}

#[tauri::command]
pub async fn tokens_save(app: AppHandle, tokens: Tokens) -> Result<(), String> {
    let vault = vault_path(&app)?;
    with_keyring(move |store| save_tokens(store, &vault, &tokens)).await
}

/// Borra los tokens guardados y la clave ("Borrar todo el caché")
pub async fn clear(app: &AppHandle) -> Result<(), String> {
    let vault = vault_path(app)?;
    if vault.exists() {
        std::fs::remove_file(&vault).map_err(|e| e.to_string())?;
    }
    with_keyring(|store| store.delete()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct MemoryStore {
        key: RefCell<Option<String>>,
        down: std::cell::Cell<bool>,
    }

    impl KeyStore for MemoryStore {
        fn get(&self) -> Result<Option<String>> {
            if self.down.get() {
                bail!("no disponible");
            }
            Ok(self.key.borrow().clone())
        }
        fn set(&self, key: &str) -> Result<()> {
            if self.down.get() {
                bail!("no disponible");
            }
            *self.key.borrow_mut() = Some(key.to_string());
            Ok(())
        }
        fn delete(&self) -> Result<()> {
            *self.key.borrow_mut() = None;
            Ok(())
        }
    }

    fn sample() -> Tokens {
        // Más grande que el límite de Windows para una entrada
        let refresh = "r".repeat(8000);
        Tokens::from([("uuid-1".to_string(), AccountTokens { access_token: Some("a".into()), refresh_token: Some(refresh) })])
    }

    #[test]
    fn tokens_roundtrip_and_are_not_readable_on_disk() {
        let dir = tempfile::tempdir().unwrap();
        let vault = dir.path().join(VAULT_FILE);
        let store = MemoryStore::default();
        save_tokens(&store, &vault, &sample()).unwrap();
        assert_eq!(load_tokens(&store, &vault).unwrap(), sample());
        let raw = String::from_utf8_lossy(&std::fs::read(&vault).unwrap()).to_string();
        assert!(!raw.contains("rrrr") && !raw.contains("uuid-1"));
        // Guardar otra vez reutiliza la misma clave
        let key = store.key.borrow().clone();
        save_tokens(&store, &vault, &sample()).unwrap();
        assert_eq!(*store.key.borrow(), key);
    }

    #[test]
    fn unavailable_store_is_an_error_and_keeps_the_vault() {
        let dir = tempfile::tempdir().unwrap();
        let vault = dir.path().join(VAULT_FILE);
        let store = MemoryStore::default();
        save_tokens(&store, &vault, &sample()).unwrap();
        store.down.set(true);
        assert!(load_tokens(&store, &vault).is_err());
        assert!(save_tokens(&store, &vault, &sample()).is_err());
        assert!(vault.exists());
        store.down.set(false);
        assert_eq!(load_tokens(&store, &vault).unwrap(), sample());
    }

    #[test]
    fn lost_key_or_damaged_file_discards_the_vault() {
        let dir = tempfile::tempdir().unwrap();
        let vault = dir.path().join(VAULT_FILE);
        let store = MemoryStore::default();
        save_tokens(&store, &vault, &sample()).unwrap();

        let mut data = std::fs::read(&vault).unwrap();
        data[20] ^= 1;
        std::fs::write(&vault, data).unwrap();
        assert!(load_tokens(&store, &vault).unwrap().is_empty());
        assert!(!vault.exists());

        save_tokens(&store, &vault, &sample()).unwrap();
        store.delete().unwrap();
        assert!(load_tokens(&store, &vault).unwrap().is_empty());
        assert!(!vault.exists());
    }

    /// Con el almacén real del sistema, sin tocar la clave de verdad del launcher
    #[test]
    #[ignore = "real: almacén del sistema"]
    fn e2e_system_keyring_roundtrip() {
        let store = SystemKeyStore { entry: "tokens-key-e2e" };
        store.delete().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let vault = dir.path().join(VAULT_FILE);
        save_tokens(&store, &vault, &sample()).unwrap();
        assert!(store.get().unwrap().is_some());
        // Otra instancia del almacén, como en el siguiente arranque
        let reopened = SystemKeyStore { entry: "tokens-key-e2e" };
        assert_eq!(load_tokens(&reopened, &vault).unwrap(), sample());
        reopened.delete().unwrap();
        assert!(store.get().unwrap().is_none());
    }

    #[test]
    fn saving_nothing_removes_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let vault = dir.path().join(VAULT_FILE);
        let store = MemoryStore::default();
        save_tokens(&store, &vault, &sample()).unwrap();
        save_tokens(&store, &vault, &Tokens::new()).unwrap();
        assert!(!vault.exists());
    }
}
