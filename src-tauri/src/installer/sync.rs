//! Instalación y actualización por manifiesto: el servidor publica la lista de
//! archivos del modpack con su SHA-256 y cada archivo suelto, guardado por su
//! hash (`objects/ab/abcdef...`). El launcher compara con lo que hay en disco y
//! solo descarga lo que cambia, comprueba el hash de cada descarga y aplica los
//! cambios con vuelta atrás si algo falla a mitad.

use anyhow::{anyhow, bail, Context, Result};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, UNIX_EPOCH};
use tokio::io::AsyncWriteExt;
use tracing::{info, warn};

use super::progress::{self, ProgressPayload, Reporter};
use super::{download, extract, http, rename_with_retries, INSTALLED_VERSION_FILE, STAGING_DIR};

/// Lo instalado por el manifiesto (hash de cada archivo tal y como lo publicó el modpack)
pub const STATE_FILE: &str = ".kb-installed.json";
/// Descargas ya verificadas; sobreviven a un fallo para no repetirlas al reintentar
pub const DOWNLOADS_DIR: &str = ".kb-downloads";
/// Versión del formato del manifiesto que entiende este launcher
const FORMAT_VERSION: u32 = 1;
const PARALLEL_DOWNLOADS: usize = 6;
const DOWNLOAD_ATTEMPTS: u32 = 5;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format_version: u32,
    pub version: String,
    /// Carpeta de los objetos: URL absoluta o relativa al manifiesto
    pub objects_url: String,
    /// Carpetas que quedan idénticas a la lista: lo que sobre en ellas se borra
    #[serde(default)]
    pub sync_dirs: Vec<String>,
    pub files: Vec<ManifestFile>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ManifestFile {
    pub path: String,
    pub sha256: String,
    pub size: u64,
    /// Ajuste del jugador (configs de cliente, opciones...): si lo cambia, se
    /// respeta mientras el modpack no publique una versión nueva de ese archivo.
    /// El resto de overrides se deja siempre como lo publica el modpack.
    #[serde(default, rename = "playerSetting")]
    pub player_setting: bool,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct InstalledState {
    version: String,
    files: BTreeMap<String, InstalledFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct InstalledFile {
    /// Hash que publicó el modpack para esta ruta
    sha256: String,
    /// Tamaño y fecha del archivo cuando coincidía con `sha256`. Si siguen
    /// iguales no hace falta volver a calcular el hash. Sin ellos, el jugador
    /// lo cambió y se conservó su versión.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    stamp: Option<(u64, u64)>,
    /// Si es un ajuste del jugador (ver `ManifestFile::player_setting`)
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    player_setting: bool,
}

/// Tramos de la barra para comprobar, descargar y aplicar
pub struct SyncPlan {
    pub step: u8,
    pub steps: u8,
    pub check: (u8, u8),
    pub download: (u8, u8),
    pub apply: (u8, u8),
}

/// Lo que hay que cambiar en la instancia
#[derive(Debug, Default)]
struct Changes {
    /// Ruta relativa -> hash del objeto a colocar en ella
    writes: BTreeMap<String, String>,
    /// Rutas relativas a borrar
    deletes: Vec<String>,
    /// Estado final de los archivos que no se tocan
    kept: BTreeMap<String, InstalledFile>,
}

pub async fn sync(
    reporter: &Reporter,
    instance_dir: &Path,
    manifest_url: &str,
    manifest_sha256: Option<&str>,
    modpack_version: Option<&str>,
    plan: SyncPlan,
) -> Result<()> {
    progress::set_phase(plan.step, plan.steps, plan.check.0, plan.check.1);
    progress::emit(reporter, ProgressPayload::Step { step: "Leyendo la lista de archivos...".into(), percent: 0 });
    let manifest = fetch_manifest(manifest_url, manifest_sha256).await?;
    let objects_url = url::Url::parse(manifest_url)
        .and_then(|base| base.join(&manifest.objects_url))
        .context("objectsUrl inválida en el manifiesto")?;

    let changes = {
        let (instance_dir, reporter) = (instance_dir.to_owned(), reporter.clone());
        let manifest_files = manifest.files.clone();
        let sync_dirs = manifest.sync_dirs.clone();
        tokio::task::spawn_blocking(move || {
            let previous = read_state(&instance_dir);
            plan_changes(&instance_dir, &manifest_files, &sync_dirs, previous.as_ref(), Some(&reporter))
        })
        .await
        .context("Error en el hilo de comprobación")??
    };
    info!(
        "[sync] {}: {} archivos a escribir, {} a borrar, {} sin cambios",
        manifest.version,
        changes.writes.len(),
        changes.deletes.len(),
        changes.kept.len()
    );

    let sizes: HashMap<&str, u64> = manifest.files.iter().map(|f| (f.sha256.as_str(), f.size)).collect();
    let needed: BTreeMap<String, u64> = changes.writes.values().map(|sha| (sha.clone(), sizes[sha.as_str()])).collect();
    let downloads = instance_dir.join(DOWNLOADS_DIR);
    progress::set_phase(plan.step, plan.steps, plan.download.0, plan.download.1);
    fetch_objects(reporter, &objects_url, &downloads, &needed).await?;

    progress::set_phase(plan.step + 1, plan.steps, plan.apply.0, plan.apply.1);
    progress::emit(reporter, ProgressPayload::Step { step: "Aplicando cambios...".into(), percent: 0 });
    let instance_dir = instance_dir.to_owned();
    let version = modpack_version.unwrap_or(&manifest.version).to_string();
    let manifest_files = manifest.files;
    extract::run_uninterrupted(move || apply_changes(&instance_dir, &manifest_files, changes, &version)).await
}

async fn fetch_manifest(url: &str, expected_sha256: Option<&str>) -> Result<Manifest> {
    let text = http::get_text(url).await?;
    if let Some(expected) = expected_sha256 {
        let actual = to_hex(&Sha256::digest(text.as_bytes()));
        if !actual.eq_ignore_ascii_case(expected) {
            bail!("La lista de archivos del modpack no coincide con la publicada (¿caché o subida a medias?). Prueba de nuevo en un rato.");
        }
    }
    let manifest: Manifest = serde_json::from_str(&text).context("Lista de archivos del modpack inválida")?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

fn validate_manifest(manifest: &Manifest) -> Result<()> {
    if manifest.format_version > FORMAT_VERSION {
        bail!("Este modpack necesita una versión más nueva del launcher");
    }
    for dir in &manifest.sync_dirs {
        safe_relative(dir)?;
    }
    let mut seen = HashSet::new();
    for file in &manifest.files {
        safe_relative(&file.path)?;
        if !is_sha256(&file.sha256) {
            bail!("Hash inválido para {}", file.path);
        }
        if !seen.insert(file.path.to_lowercase()) {
            bail!("Archivo repetido en la lista: {}", file.path);
        }
    }
    Ok(())
}

/// Una ruta del manifiesto: relativa, con `/`, sin `..` y sin pisar los archivos del launcher
fn safe_relative(path: &str) -> Result<PathBuf> {
    let p = Path::new(path);
    let valid = !path.is_empty()
        && !path.contains('\\')
        && !path.contains(':')
        && p.components().all(|c| matches!(c, Component::Normal(_)))
        && !path.starts_with(".kb-")
        && path != INSTALLED_VERSION_FILE;
    if !valid {
        bail!("Ruta no permitida en la lista de archivos: {}", path);
    }
    Ok(p.to_path_buf())
}

fn is_sha256(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn hash_file(path: &Path) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buf)?;
        if read == 0 {
            return Ok(to_hex(&hasher.finalize()));
        }
        hasher.update(&buf[..read]);
    }
}

fn stamp_of(meta: &std::fs::Metadata) -> Option<(u64, u64)> {
    let modified = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
    Some((meta.len(), modified.as_millis() as u64))
}

fn read_state(instance_dir: &Path) -> Option<InstalledState> {
    let text = std::fs::read_to_string(instance_dir.join(STATE_FILE)).ok()?;
    serde_json::from_str(&text).ok()
}

/// Hash del archivo local, sin leerlo si consta igual que cuando se instaló
fn local_hash(path: &Path, meta: &std::fs::Metadata, previous: Option<&InstalledFile>) -> Result<String> {
    if let Some(prev) = previous {
        if prev.stamp.is_some() && prev.stamp == stamp_of(meta) {
            return Ok(prev.sha256.clone());
        }
    }
    hash_file(path).with_context(|| format!("No se pudo leer {:?}", path))
}

fn in_sync_dir(path: &str, sync_dirs: &[String]) -> bool {
    sync_dirs.iter().any(|dir| path.strip_prefix(dir.as_str()).is_some_and(|rest| rest.starts_with('/')))
}

/// Decide qué escribir, qué borrar y qué dejar.
///
/// - Archivo igual al publicado: se deja.
/// - En una carpeta sincronizada (mods): se sustituye y lo que no está en la lista se borra.
/// - Ajuste del jugador (`playerSetting`): si el modpack no lo ha cambiado desde
///   la última vez pero el jugador sí, se respeta el del jugador. Si el modpack
///   lo cambió, manda el modpack.
/// - Cualquier otro override (configs generales, kubejs...): siempre como lo
///   publica el modpack, aunque lo haya cambiado el jugador o el propio juego.
/// - Override que el modpack quita: se borra, salvo un ajuste que el jugador había cambiado.
fn plan_changes(
    instance_dir: &Path,
    files: &[ManifestFile],
    sync_dirs: &[String],
    previous: Option<&InstalledState>,
    reporter: Option<&Reporter>,
) -> Result<Changes> {
    let mut changes = Changes::default();
    let prev_file = |path: &str| previous.and_then(|s| s.files.get(path));
    let start = Instant::now();
    let mut last_emit = Instant::now();

    for (i, file) in files.iter().enumerate() {
        let target = instance_dir.join(&file.path);
        let previous_entry = prev_file(&file.path);
        match std::fs::metadata(&target) {
            Ok(meta) if meta.is_file() => {
                let local = local_hash(&target, &meta, previous_entry)?;
                if local.eq_ignore_ascii_case(&file.sha256) {
                    changes.kept.insert(file.path.clone(), InstalledFile {
                        sha256: file.sha256.clone(),
                        stamp: stamp_of(&meta),
                        player_setting: file.player_setting,
                    });
                } else if file.player_setting
                    && !in_sync_dir(&file.path, sync_dirs)
                    && previous_entry.is_some_and(|p| p.sha256.eq_ignore_ascii_case(&file.sha256))
                {
                    changes.kept.insert(file.path.clone(), InstalledFile { sha256: file.sha256.clone(), stamp: None, player_setting: true });
                } else {
                    changes.writes.insert(file.path.clone(), file.sha256.to_lowercase());
                }
            }
            _ => {
                changes.writes.insert(file.path.clone(), file.sha256.to_lowercase());
            }
        }

        if let Some(reporter) = reporter {
            if last_emit.elapsed() >= Duration::from_millis(100) || i + 1 == files.len() {
                progress::emit(reporter, ProgressPayload::Extract {
                    step: "Comprobando archivos...".into(),
                    percent: ((i + 1) as f64 / files.len().max(1) as f64 * 100.0) as u8,
                    extracted_files: i + 1,
                    total_files: files.len(),
                    speed_fps: (i + 1) as f64 / start.elapsed().as_secs_f64().max(0.001),
                });
                last_emit = Instant::now();
            }
        }
    }

    let listed: HashSet<&str> = files.iter().map(|f| f.path.as_str()).collect();
    for dir in sync_dirs {
        for path in walk_files(&instance_dir.join(dir))? {
            let relative = relative_path(instance_dir, &path)?;
            if !listed.contains(relative.as_str()) {
                changes.deletes.push(relative);
            }
        }
    }
    if let Some(previous) = previous {
        for (path, entry) in &previous.files {
            if listed.contains(path.as_str()) || in_sync_dir(path, sync_dirs) || safe_relative(path).is_err() {
                continue;
            }
            let target = instance_dir.join(path);
            if let Ok(meta) = std::fs::metadata(&target) {
                let edited_setting = entry.player_setting
                    && !local_hash(&target, &meta, Some(entry))?.eq_ignore_ascii_case(&entry.sha256);
                if meta.is_file() && !edited_setting {
                    changes.deletes.push(path.clone());
                }
            }
        }
    }
    Ok(changes)
}

fn walk_files(dir: &Path) -> Result<Vec<PathBuf>> {
    let mut out = Vec::new();
    let mut pending = vec![dir.to_path_buf()];
    while let Some(dir) = pending.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(e).with_context(|| format!("No se pudo leer {:?}", dir)),
        };
        for entry in entries {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                pending.push(entry.path());
            } else {
                out.push(entry.path());
            }
        }
    }
    Ok(out)
}

/// Ruta relativa con `/`, como en el manifiesto
fn relative_path(base: &Path, path: &Path) -> Result<String> {
    let relative = path.strip_prefix(base)?;
    let parts: Vec<String> = relative.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
    Ok(parts.join("/"))
}

fn object_url(base: &url::Url, sha: &str) -> Result<String> {
    Ok(base.join(&format!("{}/{}", &sha[..2], sha))?.to_string())
}

/// Descarga los objetos que faltan en `downloads`, en paralelo y comprobando su hash
async fn fetch_objects(
    reporter: &Reporter,
    objects_url: &url::Url,
    downloads: &Path,
    needed: &BTreeMap<String, u64>,
) -> Result<()> {
    tokio::fs::create_dir_all(downloads).await?;
    let total_bytes: u64 = needed.values().sum();
    let counter = Arc::new(AtomicU64::new(0));
    let mut pending = Vec::new();

    // Lo que ya bajó un intento anterior vale si su hash cuadra
    for (sha, size) in needed {
        let dest = downloads.join(sha);
        let valid = {
            let (dest, sha) = (dest.clone(), sha.clone());
            tokio::task::spawn_blocking(move || dest.is_file() && hash_file(&dest).is_ok_and(|h| h == sha))
                .await
                .unwrap_or(false)
        };
        if valid {
            counter.fetch_add(*size, Ordering::Relaxed);
        } else {
            pending.push((sha.clone(), *size));
        }
    }

    let total_files = needed.len();
    let semaphore = Arc::new(tokio::sync::Semaphore::new(PARALLEL_DOWNLOADS));
    let mut tasks = tokio::task::JoinSet::new();
    for (sha, size) in pending {
        let url = object_url(objects_url, &sha)?;
        let dest = downloads.join(&sha);
        let (counter, semaphore) = (counter.clone(), semaphore.clone());
        tasks.spawn(async move {
            let _permit = semaphore.acquire_owned().await;
            fetch_object(&url, &dest, &sha, size, &counter).await
        });
    }

    let start = Instant::now();
    let initial = counter.load(Ordering::Relaxed);
    let mut done = total_files - tasks.len();
    let mut ticker = tokio::time::interval(Duration::from_millis(150));
    let emit = |done: usize| {
        let downloaded = counter.load(Ordering::Relaxed).min(total_bytes);
        let speed = ((downloaded.saturating_sub(initial)) as f64 / start.elapsed().as_secs_f64().max(0.001)) as u64;
        progress::emit(reporter, ProgressPayload::Download {
            step: format!("Descargando archivos ({}/{})...", done, total_files),
            percent: if total_bytes == 0 { 100 } else { (downloaded as f64 / total_bytes as f64 * 100.0) as u8 },
            downloaded_bytes: downloaded,
            total_bytes: Some(total_bytes),
            speed_bps: speed,
        });
    };

    loop {
        tokio::select! {
            next = tasks.join_next() => match next {
                None => break,
                Some(Ok(Ok(()))) => done += 1,
                Some(Ok(Err(e))) => return Err(e),
                Some(Err(e)) => return Err(anyhow!("Error en una descarga: {}", e)),
            },
            _ = ticker.tick() => emit(done),
        }
    }
    emit(done);
    Ok(())
}

/// Suma o resta del contador global lo que aporta esta descarga
fn set_counted(counter: &AtomicU64, counted: &mut u64, value: u64) {
    if value >= *counted {
        counter.fetch_add(value - *counted, Ordering::Relaxed);
    } else {
        counter.fetch_sub(*counted - value, Ordering::Relaxed);
    }
    *counted = value;
}

/// Descarga un objeto a `dest`, continuando donde se cortó y comprobando tamaño y hash
async fn fetch_object(url: &str, dest: &Path, sha: &str, size: u64, counter: &AtomicU64) -> Result<()> {
    let part = dest.with_extension("part");
    let mut counted = 0u64;
    let mut attempt = 1;
    loop {
        let result = fetch_once(url, &part, size, counter, &mut counted).await;
        let error = match result {
            Ok(hash) if hash == sha => {
                return rename_with_retries(&part, dest);
            }
            Ok(hash) => {
                tokio::fs::remove_file(&part).await.ok();
                set_counted(counter, &mut counted, 0);
                anyhow!("El archivo descargado de {} no coincide con el publicado (hash {})", url, hash)
            }
            Err(e) => e,
        };
        if attempt >= DOWNLOAD_ATTEMPTS || download::is_permanent(&error) {
            set_counted(counter, &mut counted, 0);
            return Err(error).with_context(|| format!("No se pudo descargar {}", url));
        }
        warn!("[sync] Intento {}/{} de {}: {:#}", attempt, DOWNLOAD_ATTEMPTS, url, error);
        tokio::time::sleep(Duration::from_millis(if cfg!(test) { 10 } else { 1000 * attempt as u64 })).await;
        attempt += 1;
    }
}

/// Un intento: devuelve el hash de lo descargado
async fn fetch_once(url: &str, part: &Path, size: u64, counter: &AtomicU64, counted: &mut u64) -> Result<String> {
    // Lo que ya hay en el .part entra en el hash y en el contador
    let (mut hasher, offset) = {
        let part = part.to_owned();
        tokio::task::spawn_blocking(move || -> std::io::Result<(Sha256, u64)> {
            let mut hasher = Sha256::new();
            let Ok(mut file) = std::fs::File::open(&part) else { return Ok((hasher, 0)) };
            let mut buf = vec![0u8; 1024 * 1024];
            let mut len = 0u64;
            loop {
                let read = file.read(&mut buf)?;
                if read == 0 {
                    return Ok((hasher, len));
                }
                hasher.update(&buf[..read]);
                len += read as u64;
            }
        })
        .await??
    };
    let offset = if offset > size {
        tokio::fs::remove_file(part).await.ok();
        hasher = Sha256::new();
        0
    } else {
        offset
    };
    set_counted(counter, counted, offset);

    if offset == size {
        if size == 0 {
            // Un archivo vacío no necesita petición, pero sí existir
            tokio::fs::File::create(part).await.context("No se pudo crear el archivo de descarga")?;
        }
        return Ok(to_hex(&hasher.finalize()));
    }

    let mut request = http::client().get(url);
    if offset > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={}-", offset));
    }
    let response = request.send().await.context("Error en la petición HTTP")?;
    if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
        tokio::fs::remove_file(part).await.ok();
        set_counted(counter, counted, 0);
        bail!("El servidor rechazó continuar la descarga");
    }
    let response = response.error_for_status().context("El servidor devolvió un error")?;

    let resumed = offset > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    let mut file = if resumed {
        tokio::fs::OpenOptions::new().append(true).open(part).await
    } else {
        hasher = Sha256::new();
        set_counted(counter, counted, 0);
        tokio::fs::File::create(part).await
    }
    .context("No se pudo crear el archivo de descarga")?;

    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(chunk) => chunk,
            Err(e) => {
                file.flush().await.ok();
                return Err(e).context("Error leyendo la descarga");
            }
        };
        if *counted + chunk.len() as u64 > size {
            drop(file);
            tokio::fs::remove_file(part).await.ok();
            set_counted(counter, counted, 0);
            bail!("El servidor envió más datos de los esperados");
        }
        hasher.update(&chunk);
        file.write_all(&chunk).await.context("Error escribiendo en disco")?;
        set_counted(counter, counted, *counted + chunk.len() as u64);
    }
    file.flush().await.context("Error escribiendo en disco")?;
    if *counted != size {
        bail!("Descarga incompleta: {} de {} bytes", counted, size);
    }
    Ok(to_hex(&hasher.finalize()))
}

/// Un cambio ya hecho en disco, para deshacerlo si falla uno posterior
struct Done {
    target: PathBuf,
    backup: Option<PathBuf>,
    placed: bool,
}

/// Paso final, en disco y sin red. Aparta lo que se sustituye o se borra y, si
/// algo falla, deja la instancia como estaba.
fn apply_changes(instance_dir: &Path, files: &[ManifestFile], changes: Changes, version: &str) -> Result<()> {
    let staging = instance_dir.join(STAGING_DIR);
    let backups = staging.join("backup");
    let downloads = instance_dir.join(DOWNLOADS_DIR);
    let version_file = instance_dir.join(INSTALLED_VERSION_FILE);
    let previous_version = std::fs::read_to_string(&version_file).ok();

    // Hasta terminar, la instancia consta como incompleta
    std::fs::write(&version_file, "").context("No se pudo marcar la instancia")?;

    // Cuántas rutas usan cada objeto: la última se lo lleva, las demás copian
    let mut uses: HashMap<&str, usize> = HashMap::new();
    for sha in changes.writes.values() {
        *uses.entry(sha.as_str()).or_default() += 1;
    }

    let mut done: Vec<Done> = Vec::new();
    let result = (|| -> Result<()> {
        let touched = changes.deletes.iter().chain(changes.writes.keys());
        for path in touched {
            let target = instance_dir.join(path);
            if std::fs::symlink_metadata(&target).is_ok() {
                let backup = backups.join(path);
                std::fs::create_dir_all(backup.parent().unwrap())?;
                rename_with_retries(&target, &backup)?;
                done.push(Done { target, backup: Some(backup), placed: false });
            }
        }
        for (path, sha) in &changes.writes {
            let target = instance_dir.join(path);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).with_context(|| format!("No se pudo crear {:?}", parent))?;
            }
            let source = downloads.join(sha);
            let remaining = uses.get_mut(sha.as_str()).unwrap();
            *remaining -= 1;
            if *remaining == 0 {
                rename_with_retries(&source, &target)?;
            } else {
                std::fs::copy(&source, &target).with_context(|| format!("No se pudo copiar a {:?}", target))?;
            }
            match done.iter_mut().find(|d| d.target == target) {
                Some(entry) => entry.placed = true,
                None => done.push(Done { target, backup: None, placed: true }),
            }
        }
        Ok(())
    })();

    if let Err(e) = result {
        for entry in done.iter().rev() {
            if entry.placed {
                std::fs::remove_file(&entry.target).ok();
            }
            if let Some(backup) = &entry.backup {
                rename_with_retries(backup, &entry.target).ok();
            }
        }
        match previous_version {
            Some(previous) => std::fs::write(&version_file, previous).ok(),
            None => std::fs::remove_file(&version_file).ok(),
        };
        return Err(e).context("No se pudieron aplicar los cambios. ¿Hay algún archivo abierto?");
    }

    for path in &changes.deletes {
        remove_empty_parents(instance_dir, &instance_dir.join(path));
    }

    let mut state = InstalledState { version: version.to_string(), files: changes.kept };
    for file in files {
        if changes.writes.contains_key(&file.path) {
            let stamp = std::fs::metadata(instance_dir.join(&file.path)).ok().and_then(|m| stamp_of(&m));
            state.files.insert(file.path.clone(), InstalledFile {
                sha256: file.sha256.to_lowercase(),
                stamp,
                player_setting: file.player_setting,
            });
        }
    }
    let json = serde_json::to_string(&state)?;
    std::fs::write(instance_dir.join(STATE_FILE), json).context("No se pudo guardar el estado de la instancia")?;
    std::fs::write(&version_file, version).context("No se pudo guardar la versión instalada")?;
    std::fs::remove_dir_all(&staging).ok();
    std::fs::remove_dir_all(&downloads).ok();
    Ok(())
}

/// Quita las carpetas que se quedan vacías al borrar un archivo, sin salir de la instancia
fn remove_empty_parents(instance_dir: &Path, path: &Path) {
    let mut dir = path.parent();
    while let Some(current) = dir {
        if current == instance_dir || !current.starts_with(instance_dir) || std::fs::remove_dir(current).is_err() {
            break;
        }
        dir = current.parent();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::extract::{Path as AxumPath, State};
    use axum::http::StatusCode;
    use axum::routing::get;
    use std::sync::Mutex;

    type Served = Arc<Mutex<HashMap<String, Vec<u8>>>>;

    fn sha(data: &[u8]) -> String {
        to_hex(&Sha256::digest(data))
    }

    /// Servidor con `objects/ab/<sha>` y `manifest.json`; cuenta las descargas de objetos
    struct Server {
        url: String,
        served: Served,
        hits: Arc<Mutex<Vec<String>>>,
    }

    impl Server {
        async fn start() -> Self {
            let served: Served = Default::default();
            let hits: Arc<Mutex<Vec<String>>> = Default::default();
            let app = axum::Router::new()
                .route(
                    "/{*path}",
                    get(|State((served, hits)): State<(Served, Arc<Mutex<Vec<String>>>)>, AxumPath(path): AxumPath<String>| async move {
                        if path.starts_with("objects/") {
                            hits.lock().unwrap().push(path.clone());
                        }
                        match served.lock().unwrap().get(&path) {
                            Some(body) => (StatusCode::OK, body.clone()),
                            None => (StatusCode::NOT_FOUND, Vec::new()),
                        }
                    }),
                )
                .with_state((served.clone(), hits.clone()));
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addr = listener.local_addr().unwrap();
            tokio::spawn(async move { axum::serve(listener, app).await });
            Self { url: format!("http://{}", addr), served, hits }
        }

        /// Publica una versión y devuelve (url del manifiesto, sha del manifiesto)
        fn publish(&self, version: &str, files: &[(&str, &[u8])]) -> (String, String) {
            let mut served = self.served.lock().unwrap();
            let mut list = Vec::new();
            for (path, data) in files {
                let hash = sha(data);
                served.insert(format!("objects/{}/{}", &hash[..2], hash), data.to_vec());
                list.push(serde_json::json!({
                    "path": path, "sha256": hash, "size": data.len(), "playerSetting": path.contains("client"),
                }));
            }
            let manifest = serde_json::json!({
                "formatVersion": 1, "version": version, "objectsUrl": "objects/",
                "syncDirs": ["mods"], "files": list,
            })
            .to_string();
            let manifest_sha = sha(manifest.as_bytes());
            served.insert(format!("manifest-{}.json", version), manifest.into_bytes());
            (format!("{}/manifest-{}.json", self.url, version), manifest_sha)
        }

        fn take_hits(&self) -> Vec<String> {
            std::mem::take(&mut *self.hits.lock().unwrap())
        }
    }

    fn plan() -> SyncPlan {
        SyncPlan { step: 1, steps: 2, check: (0, 5), download: (5, 95), apply: (95, 100) }
    }

    async fn run(instance: &Path, (url, sha): &(String, String), version: &str) -> Result<()> {
        sync(&Reporter::none(), instance, url, Some(sha), Some(version), plan()).await
    }

    fn read(instance: &Path, path: &str) -> String {
        std::fs::read_to_string(instance.join(path)).unwrap()
    }

    #[tokio::test]
    async fn installs_then_only_downloads_what_changed() {
        let dir = tempfile::tempdir().unwrap();
        let instance = dir.path();
        let server = Server::start().await;

        let v1 = server.publish("1.0", &[
            ("mods/a.jar", b"a1"),
            ("mods/b.jar", b"b1"),
            ("config/x.toml", b"x1"),
            ("resourcepacks/pack.zip", b"same"),
            ("config/copia/pack.zip", b"same"),
            ("config/vacio.json", b""),
        ]);
        run(instance, &v1, "1.0").await.unwrap();
        assert_eq!(read(instance, "config/vacio.json"), "");
        assert_eq!(read(instance, "mods/a.jar"), "a1");
        assert_eq!(read(instance, "config/copia/pack.zip"), "same");
        assert_eq!(read(instance, INSTALLED_VERSION_FILE), "1.0");
        // El archivo repetido se descarga una vez
        assert_eq!(server.take_hits().len(), 4, "el vacío no se pide");

        // Un mod del jugador en mods/ se va; un archivo suyo fuera de la lista se queda
        std::fs::write(instance.join("mods/extra.jar"), "x").unwrap();
        std::fs::write(instance.join("options.txt"), "jugador").unwrap();

        let v2 = server.publish("2.0", &[
            ("mods/a.jar", b"a1"),
            ("mods/c.jar", b"c2"),
            ("config/x.toml", b"x2"),
            ("resourcepacks/pack.zip", b"same"),
        ]);
        run(instance, &v2, "2.0").await.unwrap();
        let hits = server.take_hits();
        assert_eq!(hits.len(), 2, "solo c.jar y x.toml: {:?}", hits);
        assert!(!instance.join("mods/b.jar").exists());
        assert!(!instance.join("mods/extra.jar").exists());
        assert!(!instance.join("config/copia").exists(), "override retirado y su carpeta vacía");
        assert_eq!(read(instance, "mods/c.jar"), "c2");
        assert_eq!(read(instance, "config/x.toml"), "x2");
        assert_eq!(read(instance, "options.txt"), "jugador");
        assert_eq!(read(instance, INSTALLED_VERSION_FILE), "2.0");
        assert!(!instance.join(STAGING_DIR).exists());
        assert!(!instance.join(DOWNLOADS_DIR).exists());

        // Sin cambios: no descarga nada
        run(instance, &v2, "2.0").await.unwrap();
        assert!(server.take_hits().is_empty());
    }

    #[tokio::test]
    async fn shared_overrides_follow_the_pack_and_player_settings_are_kept() {
        let dir = tempfile::tempdir().unwrap();
        let instance = dir.path();
        let server = Server::start().await;
        // En el servidor de pruebas, lo que lleva "client" en la ruta es un ajuste del jugador
        let v1 = server.publish("1.0", &[
            ("config/mod-common.toml", b"comun1"),
            ("config/mod-client.toml", b"cliente1"),
            ("config/retirado-client.toml", b"r"),
            ("config/retirado-common.toml", b"r"),
            ("kubejs/script.js", b"js1"),
        ]);
        run(instance, &v1, "1.0").await.unwrap();

        // Caso 1: tú cambias un override y el jugador no ha tocado nada -> le llega el nuevo
        let v2 = server.publish("2.0", &[
            ("config/mod-common.toml", b"comun2"),
            ("config/mod-client.toml", b"cliente1"),
            ("config/retirado-client.toml", b"r"),
            ("config/retirado-common.toml", b"r"),
            ("kubejs/script.js", b"js1"),
        ]);
        run(instance, &v2, "2.0").await.unwrap();
        assert_eq!(read(instance, "config/mod-common.toml"), "comun2");

        // El juego (o el jugador) cambia archivos generales y un ajuste suyo
        std::fs::write(instance.join("config/mod-common.toml"), "reescrito por el mod").unwrap();
        std::fs::write(instance.join("kubejs/script.js"), "tocado").unwrap();
        std::fs::write(instance.join("config/mod-client.toml"), "mis ajustes").unwrap();
        std::fs::write(instance.join("config/retirado-client.toml"), "mios").unwrap();
        std::fs::write(instance.join("config/retirado-common.toml"), "tocado").unwrap();

        // Caso 2: tú no cambias esos archivos y retiras dos
        //  - generales: vuelven a ser los del servidor; el retirado se borra
        //  - ajustes del jugador: se respetan, también el retirado
        let v3 = server.publish("3.0", &[
            ("config/mod-common.toml", b"comun2"),
            ("config/mod-client.toml", b"cliente1"),
            ("kubejs/script.js", b"js1"),
        ]);
        run(instance, &v3, "3.0").await.unwrap();
        assert_eq!(read(instance, "config/mod-common.toml"), "comun2");
        assert_eq!(read(instance, "kubejs/script.js"), "js1");
        assert!(!instance.join("config/retirado-common.toml").exists());
        assert_eq!(read(instance, "config/mod-client.toml"), "mis ajustes");
        assert_eq!(read(instance, "config/retirado-client.toml"), "mios");

        // Caso 3: tú cambias un ajuste de cliente que el jugador había editado -> gana el servidor
        let v4 = server.publish("4.0", &[
            ("config/mod-common.toml", b"comun2"),
            ("config/mod-client.toml", b"cliente4"),
            ("kubejs/script.js", b"js1"),
        ]);
        run(instance, &v4, "4.0").await.unwrap();
        assert_eq!(read(instance, "config/mod-client.toml"), "cliente4");
    }

    #[tokio::test]
    async fn bad_object_or_manifest_leaves_the_instance_intact() {
        let dir = tempfile::tempdir().unwrap();
        let instance = dir.path();
        let server = Server::start().await;
        let v1 = server.publish("1.0", &[("mods/a.jar", b"a1"), ("config/x.toml", b"x1")]);
        run(instance, &v1, "1.0").await.unwrap();

        // Objeto corrupto en el servidor: el hash no cuadra
        let v2 = server.publish("2.0", &[("mods/a.jar", b"a2"), ("config/x.toml", b"x2")]);
        let bad = sha(b"a2");
        server.served.lock().unwrap().insert(format!("objects/{}/{}", &bad[..2], bad), b"a3".to_vec());
        let err = run(instance, &v2, "2.0").await.unwrap_err();
        assert!(format!("{:#}", err).contains("no coincide"), "{:#}", err);
        assert_eq!(read(instance, "mods/a.jar"), "a1");
        assert_eq!(read(instance, "config/x.toml"), "x1");
        assert_eq!(read(instance, INSTALLED_VERSION_FILE), "1.0");

        // Manifiesto distinto del anunciado en latest.json
        let (url, _) = v2.clone();
        assert!(run(instance, &(url, sha(b"otro")), "2.0").await.is_err());
        assert_eq!(read(instance, INSTALLED_VERSION_FILE), "1.0");

        // Arreglado en el servidor: lo ya verificado (x.toml) no se vuelve a bajar
        server.take_hits();
        server.served.lock().unwrap().insert(format!("objects/{}/{}", &bad[..2], bad), b"a2".to_vec());
        run(instance, &v2, "2.0").await.unwrap();
        assert_eq!(server.take_hits().len(), 1);
        assert_eq!(read(instance, "mods/a.jar"), "a2");
        assert_eq!(read(instance, "config/x.toml"), "x2");
    }

    #[tokio::test]
    async fn resumes_an_object_after_the_connection_drops() {
        use axum::http::HeaderMap;
        use axum::response::{IntoResponse, Response};

        let data: Vec<u8> = (0..2_000_000u32).map(|i| (i % 251) as u8).collect();
        let hash = sha(&data);
        let calls = Arc::new(Mutex::new(Vec::<u64>::new()));
        let handler = {
            let (data, calls) = (data.clone(), calls.clone());
            move |headers: HeaderMap| {
                let (data, calls) = (data.clone(), calls.clone());
                async move {
                    let offset: usize = headers
                        .get("range")
                        .and_then(|r| r.to_str().ok())
                        .and_then(|r| r.strip_prefix("bytes=")?.strip_suffix('-')?.parse().ok())
                        .unwrap_or(0);
                    let first = { let mut c = calls.lock().unwrap(); c.push(offset as u64); c.len() == 1 };
                    let rest = data[offset..].to_vec();
                    let status = if offset > 0 { StatusCode::PARTIAL_CONTENT } else { StatusCode::OK };
                    let len = rest.len().to_string();
                    if first {
                        let stream = futures_util::stream::iter(vec![
                            Ok::<_, std::io::Error>(axum::body::Bytes::from(rest[..rest.len() / 2].to_vec())),
                            Err(std::io::Error::other("corte")),
                        ]);
                        return (status, [("content-length", len)], axum::body::Body::from_stream(stream)).into_response();
                    }
                    let response: Response = (status, [("content-length", len)], rest).into_response();
                    response
                }
            }
        };
        let app = axum::Router::new().route("/obj", get(handler));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await });

        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join(&hash);
        let counter = AtomicU64::new(0);
        fetch_object(&format!("http://{}/obj", addr), &dest, &hash, data.len() as u64, &counter).await.unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), data);
        assert_eq!(counter.load(Ordering::Relaxed), data.len() as u64);
        let calls = calls.lock().unwrap();
        assert_eq!(calls.len(), 2);
        assert!(calls[1] > 0, "el segundo intento continúa donde se cortó");
    }

    #[test]
    fn failed_apply_rolls_back() {
        let dir = tempfile::tempdir().unwrap();
        let instance = dir.path();
        std::fs::create_dir_all(instance.join("mods")).unwrap();
        std::fs::write(instance.join("mods/a.jar"), "a1").unwrap();
        std::fs::write(instance.join("mods/b.jar"), "b1").unwrap();
        std::fs::write(instance.join(INSTALLED_VERSION_FILE), "1.0").unwrap();
        std::fs::create_dir_all(instance.join(DOWNLOADS_DIR)).unwrap();
        std::fs::write(instance.join(DOWNLOADS_DIR).join("aa"), "a2").unwrap();

        // "zz" no se descargó: falla después de cambiar a.jar y borrar b.jar
        let changes = Changes {
            writes: BTreeMap::from([("mods/a.jar".into(), "aa".into()), ("mods/z.jar".into(), "zz".into())]),
            deletes: vec!["mods/b.jar".into()],
            kept: BTreeMap::new(),
        };
        assert!(apply_changes(instance, &[], changes, "2.0").is_err());
        assert_eq!(read(instance, "mods/a.jar"), "a1");
        assert_eq!(read(instance, "mods/b.jar"), "b1");
        assert!(!instance.join("mods/z.jar").exists());
        assert_eq!(read(instance, INSTALLED_VERSION_FILE), "1.0");
    }

    #[test]
    fn rejects_unsafe_paths() {
        for bad in ["../x", "/etc/passwd", "a/../../b", "C:\\x", "a\\b", "c:x", ".kb-installed.json", "installed_version", ""] {
            assert!(safe_relative(bad).is_err(), "{}", bad);
        }
        assert!(safe_relative("config/a b/c.toml").is_ok());
    }
}
