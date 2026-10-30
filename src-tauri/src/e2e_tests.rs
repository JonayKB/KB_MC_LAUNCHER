//! Pruebas reales contra Mojang, Adoptium, Fabric, Forge y NeoForge: instalan de
//! verdad y arrancan el juego con el mismo comando que un jugador. Necesitan
//! red, varios GB de disco y un servidor X (`DISPLAY`), así que van aparte:
//!
//!   KB_E2E_DIR=/ruta/grande DISPLAY=:99 KB_E2E_CASES=vanilla-26.3,forge-1.20.1 \
//!     cargo test --lib e2e -- --ignored --nocapture --test-threads=1
//!
//! `KB_E2E_DIR` se reutiliza entre ejecuciones (como la carpeta del launcher).

use crate::installer::progress::Reporter;
use crate::installer::rules;
use crate::installer::sysinfo::{recommend_settings, SystemInfo};
use crate::installer::{self, http};
use crate::launcher::{build_plan, LaunchAuth, LaunchPlan, LaunchRequest, LaunchSettings};
use axum::routing::get;
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, BufReader};

/// (id, loader, Minecraft, versión del loader)
const CASES: &[(&str, &str, &str, &str)] = &[
    ("vanilla-1.12.2", "vanilla", "1.12.2", ""),
    ("vanilla-1.16.5", "vanilla", "1.16.5", ""),
    ("vanilla-1.18.2", "vanilla", "1.18.2", ""),
    ("vanilla-1.19", "vanilla", "1.19", ""),
    ("vanilla-1.20.1", "vanilla", "1.20.1", ""),
    ("vanilla-1.20.6", "vanilla", "1.20.6", ""),
    ("vanilla-1.21.1", "vanilla", "1.21.1", ""),
    ("vanilla-26.3", "vanilla", "26.3", ""),
    ("fabric-1.20.1", "fabric", "1.20.1", "0.20.1"),
    ("fabric-1.21.1", "fabric", "1.21.1", "0.20.1"),
    ("fabric-26.3", "fabric", "26.3", "0.20.1"),
    ("forge-1.12.2", "forge", "1.12.2", "14.23.5.2859"),
    ("forge-1.16.5", "forge", "1.16.5", "36.2.34"),
    ("forge-1.20.1", "forge", "1.20.1", "47.4.10"),
    ("forge-1.21.1", "forge", "1.21.1", "52.1.20"),
    ("neoforge-1.21.1", "neoforge", "1.21.1", "21.1.265"),
    ("neoforge-26.3", "neoforge", "26.3", "26.3.0.99"),
];

/// Tiempo máximo hasta que el juego llega a su pantalla
const START_TIMEOUT: Duration = Duration::from_secs(300);
/// Atlas de texturas creado: ventana, OpenGL, recursos y loader funcionan
const STARTED_MARKERS: &[&str] = &["textures/atlas/", "Sound engine started", "Created: 1024x"];

fn base_dir() -> PathBuf {
    PathBuf::from(std::env::var("KB_E2E_DIR").expect("define KB_E2E_DIR"))
}

fn selected(id: &str) -> bool {
    match std::env::var("KB_E2E_CASES") {
        Ok(list) => list.split(',').any(|c| c == id),
        Err(_) => true,
    }
}

async fn content_server() -> String {
    let empty_zip = {
        let mut out = std::io::Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(&mut out);
        zip.start_file("kb-e2e.txt", zip::write::SimpleFileOptions::default()).unwrap();
        zip.write_all(b"e2e").unwrap();
        zip.finish().unwrap();
        out.into_inner()
    };
    let app = axum::Router::new().route("/empty.zip", get(move || { let b = empty_zip.clone(); async move { b } }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await });
    format!("http://{}/empty.zip", addr)
}

/// Comprueba contra el `sha1` de Mojang todo lo descargado para este sistema
fn verify_libraries(json: &Value, libs_dir: &Path) -> usize {
    let mut checked = 0;
    for lib in json["libraries"].as_array().into_iter().flatten() {
        if !rules::rules_allow(lib.get("rules")) {
            continue;
        }
        let mut entries = vec![&lib["downloads"]["artifact"]];
        if let Some(classifier) = rules::native_classifier(lib) {
            entries.push(&lib["downloads"]["classifiers"][&classifier]);
        }
        for entry in entries {
            let (Some(path), Some(sha1)) = (entry["path"].as_str(), entry["sha1"].as_str()) else { continue };
            let bytes = std::fs::read(libs_dir.join(path)).unwrap_or_else(|e| panic!("falta {}: {}", path, e));
            let actual: String = Sha1::digest(&bytes).iter().map(|b| format!("{:02x}", b)).collect();
            assert_eq!(actual, sha1, "{} corrupto", path);
            checked += 1;
        }
    }
    checked
}

fn e2e_settings() -> LaunchSettings {
    // Los mismos flags que recomienda el launcher a un equipo de 16 GB
    let info = SystemInfo { total_ram_mb: 16384, cpu_cores: 8, os: "linux".into(), screen_height: 1080, screen_width: 1920 };
    let recommended = recommend_settings(&info);
    LaunchSettings {
        min_ram_mb: 1024,
        max_ram_mb: 4096,
        fullscreen: false,
        window_width: 854,
        window_height: 480,
        extra_jvm_args: recommended.extra_jvm_args,
    }
}

/// Arranca el juego hasta su pantalla. Devuelve la línea que lo demuestra.
async fn play(plan: &LaunchPlan, log_path: &Path) -> Result<String, String> {
    let mut child = tokio::process::Command::new(&plan.java_bin)
        .args(&plan.args)
        .current_dir(&plan.instance_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| e.to_string())?;

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    for reader in [
        Box::new(child.stdout.take().unwrap()) as Box<dyn tokio::io::AsyncRead + Unpin + Send>,
        Box::new(child.stderr.take().unwrap()),
    ] {
        let tx = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(reader).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = tx.send(line);
            }
        });
    }
    drop(tx);

    let mut log = std::fs::File::create(log_path).unwrap();
    let deadline = tokio::time::Instant::now() + START_TIMEOUT;
    let mut proof = None;
    loop {
        tokio::select! {
            line = rx.recv() => match line {
                Some(line) => {
                    writeln!(log, "{}", line).unwrap();
                    if proof.is_none() && STARTED_MARKERS.iter().any(|m| line.contains(m)) {
                        proof = Some(line);
                        break;
                    }
                }
                None => break,
            },
            _ = tokio::time::sleep_until(deadline) => break,
        }
    }

    // Sigue vivo unos segundos más: no basta con haber llegado a la pantalla
    if proof.is_some() {
        let settle = tokio::time::sleep(Duration::from_secs(8));
        tokio::pin!(settle);
        loop {
            tokio::select! {
                line = rx.recv() => match line {
                    Some(line) => writeln!(log, "{}", line).unwrap(),
                    None => break,
                },
                _ = &mut settle => break,
            }
        }
    }

    let exited = child.try_wait().map_err(|e| e.to_string())?;
    let _ = child.kill().await;
    match (proof, exited) {
        (Some(line), None) => Ok(line),
        (_, Some(status)) => Err(format!("el proceso terminó: {}", status)),
        (None, None) => Err("no llegó a la pantalla a tiempo".to_string()),
    }
}

async fn run_case(id: &str, loader: &str, mc: &str, loader_version: &str, url: &str) -> Result<String, String> {
    let base = base_dir();
    let start = Instant::now();
    installer::install_with(
        Reporter::none(), &base, mc, loader, Some(loader_version.to_string()), url, url, id, Some("1.0"),
    )
    .await
    .map_err(|e| format!("instalación: {:#}", e))?;
    let installed_in = start.elapsed().as_secs();

    let mc_json: Value = serde_json::from_str(
        &std::fs::read_to_string(base.join("versions").join(mc).join(format!("{}.json", mc))).unwrap(),
    )
    .unwrap();
    let verified = verify_libraries(&mc_json, &base.join("libraries"));

    let auth = LaunchAuth::new("KBTester".to_string(), None, None);
    let settings = e2e_settings();
    let plan = build_plan(
        &LaunchRequest {
            base: &base,
            modpack_id: id,
            mc_version: mc,
            loader,
            loader_version,
            auth: &auth,
            settings: &settings,
            launcher_version: "e2e",
        },
        &Reporter::none(),
    )
    .await
    .map_err(|e| format!("plan: {:#}", e))?;

    if let Some(unresolved) = plan.args.iter().find(|a| a.contains("${")) {
        return Err(format!("variable sin resolver: {}", unresolved));
    }

    let log_path = base.join(format!("{}.log", id));
    std::fs::write(base.join(format!("{}.args", id)), plan.args.join("\n")).unwrap();
    let proof = play(&plan, &log_path).await.map_err(|e| format!("juego: {} (ver {:?})", e, log_path))?;
    let shown: String = proof.chars().rev().take(70).collect::<Vec<_>>().into_iter().rev().collect();
    Ok(format!("instalado en {}s, {} libs con sha1 OK, «{}»", installed_in, verified, shown))
}

#[tokio::test]
#[ignore = "real: red, disco y pantalla"]
async fn e2e_install_and_play() {
    let url = content_server().await;
    let mut failures = Vec::new();
    for (id, loader, mc, loader_version) in CASES.iter().filter(|c| selected(c.0)) {
        let result = run_case(id, loader, mc, loader_version, &url).await;
        match &result {
            Ok(summary) => println!("OK   {:<18} {}", id, summary),
            Err(error) => {
                println!("FAIL {:<18} {}", id, error);
                failures.push(id.to_string());
            }
        }
    }
    assert!(failures.is_empty(), "fallaron: {:?}", failures);
}

#[tokio::test]
#[ignore = "real: red"]
async fn e2e_java_versions_from_adoptium() {
    let base = base_dir();
    for major in [8, 17, 21, 25] {
        let binary = crate::installer::requirements::ensure_java(major, &base, &Reporter::none()).await.unwrap();
        let version = crate::installer::requirements::java_version_output(&binary).await.unwrap();
        let expected = if major == 8 { "1.8.0".to_string() } else { format!("\"{}.", major) };
        assert!(version.contains(&expected), "{}: {}", major, version);
        println!("OK   Java {}: {}", major, version.lines().next().unwrap_or(""));
    }
}

/// Todos los flags que puede generar `gc_args`, en cada Java real
#[tokio::test]
#[ignore = "real: red"]
async fn e2e_jvm_flags_are_accepted_by_every_java() {
    let base = base_dir();
    let extra = e2e_settings().extra_jvm_args;
    for major in [8u32, 17, 21, 25] {
        let binary = crate::installer::requirements::ensure_java(major, &base, &Reporter::none()).await.unwrap();
        for (ram, cores) in [(2048u32, 2usize), (3072, 4), (4096, 8), (6144, 16), (8192, 8), (12288, 32)] {
            let gc = crate::installer::sysinfo::gc_args(major, ram, cores);
            let output = tokio::process::Command::new(&binary)
                .arg(format!("-Xmx{}M", ram))
                .args(&gc.args)
                .args(extra.split_whitespace())
                .arg("-version")
                .output()
                .await
                .unwrap();
            let stderr = String::from_utf8_lossy(&output.stderr);
            assert!(output.status.success(), "Java {} {}MB: {}", major, ram, stderr);
            assert!(!stderr.contains("warning"), "Java {} {}MB: {}", major, ram, stderr);
        }
        println!("OK   Java {}: todos los flags aceptados", major);
    }
}

/// El instalador real con el modpack publicado en me.jonaykb.com
#[tokio::test]
#[ignore = "real: red y varios GB"]
async fn e2e_published_modpack_install_update_and_launch() {
    let base = base_dir();
    let pack: Value = http::get_json("https://me.jonaykb.com/modpacks/craft-to-exile-2/latest.json").await.unwrap();
    let (mc, forge) = (pack["minecraftVersion"].as_str().unwrap(), pack["forgeVersion"].as_str().unwrap());
    let (mods, overrides) = (pack["modsUrl"].as_str().unwrap(), pack["overridesUrl"].as_str().unwrap());
    let id = "e2e-ctx2";

    installer::install_with(Reporter::none(), &base, mc, "forge", Some(forge.to_string()), overrides, mods, id, Some("old")).await.unwrap();
    let instance = base.join("instances").join(id);
    let jars = std::fs::read_dir(instance.join("mods")).unwrap().count();
    assert!(jars > 50, "solo {} mods", jars);

    // Actualizar sobre lo instalado con los archivos reales
    std::fs::write(instance.join("mods").join("sobrante.jar"), "x").unwrap();
    installer::update_with(Reporter::none(), &base, overrides, mods, id, Some("new")).await.unwrap();
    assert!(!instance.join("mods").join("sobrante.jar").exists());
    assert_eq!(std::fs::read_dir(instance.join("mods")).unwrap().count(), jars);
    assert_eq!(std::fs::read_to_string(instance.join(installer::INSTALLED_VERSION_FILE)).unwrap(), "new");
    assert!(!instance.join(installer::STAGING_DIR).exists());

    // Un fallo real de red a mitad de actualización no toca nada
    let result = installer::update_with(Reporter::none(), &base, "https://me.jonaykb.com/modpacks/no-existe.zip", mods, id, Some("rota")).await;
    assert!(result.is_err());
    assert_eq!(std::fs::read_dir(instance.join("mods")).unwrap().count(), jars);
    assert_eq!(std::fs::read_to_string(instance.join(installer::INSTALLED_VERSION_FILE)).unwrap(), "new");
    println!("OK   modpack publicado: {} mods, instalar, actualizar y fallo seguro", jars);

    let auth = LaunchAuth::new("KBTester".to_string(), None, None);
    let settings = LaunchSettings { max_ram_mb: 8192, min_ram_mb: 4096, ..e2e_settings() };
    let plan = build_plan(
        &LaunchRequest {
            base: &base, modpack_id: id, mc_version: mc, loader: "forge", loader_version: forge,
            auth: &auth, settings: &settings, launcher_version: "e2e",
        },
        &Reporter::none(),
    )
    .await
    .unwrap();
    let log = base.join("e2e-ctx2.log");
    let proof = play(&plan, &log).await.unwrap_or_else(|e| panic!("{} (ver {:?})", e, log));
    println!("OK   modpack publicado arranca: {}", proof);
}
