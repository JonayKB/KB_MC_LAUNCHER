//! Interpreta los JSON de versión de Mojang: reglas por sistema operativo,
//! nativos antiguos y rutas Maven.

use serde_json::Value;

/// Nombre del sistema en las reglas de Mojang
pub fn os_name() -> &'static str {
    match std::env::consts::OS {
        "macos" => "osx",
        "windows" => "windows",
        _ => "linux",
    }
}

fn arch_name() -> &'static str {
    match std::env::consts::ARCH {
        "x86" => "x86",
        "aarch64" => "arm64",
        _ => "x86_64",
    }
}

fn rule_matches(rule: &Value) -> bool {
    // Las reglas por features (demo, resolución personalizada...) no se activan nunca
    if rule.get("features").is_some() {
        return false;
    }
    let Some(os) = rule.get("os") else { return true };
    let name_ok = os["name"].as_str().is_none_or(|n| n == os_name());
    let arch_ok = os["arch"].as_str().is_none_or(|a| a == arch_name());
    name_ok && arch_ok
}

/// Sin reglas todo se permite; con reglas manda la última que coincida
pub fn rules_allow(rules: Option<&Value>) -> bool {
    let Some(rules) = rules.and_then(Value::as_array) else { return true };
    rules.iter().fold(false, |allowed, rule| {
        if rule_matches(rule) {
            rule["action"].as_str() == Some("allow")
        } else {
            allowed
        }
    })
}

/// Una biblioteca a descargar: (url, ruta dentro de `libraries/`)
pub type LibraryFile = (String, String);

fn file_of(entry: &Value) -> Option<LibraryFile> {
    let url = entry["url"].as_str().filter(|u| !u.is_empty())?;
    Some((url.to_string(), entry["path"].as_str()?.to_string()))
}

/// Clasificador con los nativos de este sistema (Minecraft anterior a la 1.19)
pub fn native_classifier(lib: &Value) -> Option<String> {
    let bits = if cfg!(target_pointer_width = "64") { "64" } else { "32" };
    lib["natives"][os_name()]
        .as_str()
        .map(|c| c.replace("${arch}", bits))
}

/// Archivos a descargar de un JSON con el formato `downloads` de Mojang,
/// ya filtrados por las reglas de este sistema
pub fn library_files(json: &Value) -> Vec<LibraryFile> {
    let mut files = Vec::new();
    for lib in json["libraries"].as_array().into_iter().flatten() {
        if !rules_allow(lib.get("rules")) {
            continue;
        }
        files.extend(file_of(&lib["downloads"]["artifact"]));
        if let Some(classifier) = native_classifier(lib) {
            files.extend(file_of(&lib["downloads"]["classifiers"][&classifier]));
        }
    }
    files
}

/// Una biblioteca con nativos que hay que extraer al lanzar
pub struct NativeLibrary {
    pub file: LibraryFile,
    /// Prefijos a no extraer (p. ej. `META-INF/`)
    pub exclude: Vec<String>,
}

pub fn native_libraries(json: &Value) -> Vec<NativeLibrary> {
    json["libraries"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|lib| rules_allow(lib.get("rules")))
        .filter_map(|lib| {
            let classifier = native_classifier(lib)?;
            let file = file_of(&lib["downloads"]["classifiers"][&classifier])?;
            let exclude = lib["extract"]["exclude"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|e| e.as_str().map(String::from))
                .collect();
            Some(NativeLibrary { file, exclude })
        })
        .collect()
}

/// Identidad de una biblioteca sin su versión: `grupo:artefacto[:clasificador]`.
/// Si Minecraft y el loader traen versiones distintas, se usa la del loader.
pub fn library_key(name: &str) -> String {
    let name = name.split('@').next().unwrap_or(name);
    let parts: Vec<&str> = name.split(':').collect();
    match parts.as_slice() {
        [group, artifact, _version, classifier, ..] => format!("{group}:{artifact}:{classifier}"),
        [group, artifact, ..] => format!("{group}:{artifact}"),
        _ => name.to_string(),
    }
}

/// `grupo:artefacto:versión[:clasificador][@ext]` →
/// `grupo/artefacto/versión/artefacto-versión[-clasificador].ext`
pub fn maven_relative_path(name: &str) -> Option<String> {
    let (coords, ext) = name.split_once('@').unwrap_or((name, "jar"));
    let parts: Vec<&str> = coords.splitn(4, ':').collect();
    if parts.len() < 3 {
        return None;
    }
    let (group, artifact, version) = (parts[0].replace('.', "/"), parts[1], parts[2]);
    let classifier = parts.get(3).map(|c| format!("-{}", c)).unwrap_or_default();
    Some(format!("{group}/{artifact}/{version}/{artifact}-{version}{classifier}.{ext}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rules_follow_mojang_semantics() {
        assert!(rules_allow(None));
        let only_here = json!([{ "action": "allow", "os": { "name": os_name() } }]);
        assert!(rules_allow(Some(&only_here)));
        let not_here = json!([{ "action": "allow" }, { "action": "disallow", "os": { "name": os_name() } }]);
        assert!(!rules_allow(Some(&not_here)));
        let elsewhere = json!([{ "action": "allow", "os": { "name": "plan9" } }]);
        assert!(!rules_allow(Some(&elsewhere)));
        let feature = json!([{ "action": "allow", "features": { "is_demo_user": true } }]);
        assert!(!rules_allow(Some(&feature)));
    }

    #[test]
    fn maven_path_with_and_without_classifier() {
        assert_eq!(
            maven_relative_path("net.fabricmc:fabric-loader:0.16.10").unwrap(),
            "net/fabricmc/fabric-loader/0.16.10/fabric-loader-0.16.10.jar"
        );
        assert_eq!(
            maven_relative_path("org.lwjgl:lwjgl:3.3.1:natives-linux").unwrap(),
            "org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-linux.jar"
        );
        assert_eq!(maven_relative_path("a.b:c:1@zip").unwrap(), "a/b/c/1/c-1.zip");
        assert!(maven_relative_path("roto").is_none());
    }

    #[test]
    fn library_key_ignores_only_the_version() {
        assert_eq!(library_key("org.ow2.asm:asm:9.3"), library_key("org.ow2.asm:asm:9.8"));
        assert_ne!(library_key("org.lwjgl:lwjgl:3.3.1"), library_key("org.lwjgl:lwjgl:3.3.1:natives-linux"));
    }

    #[test]
    fn legacy_natives_pick_this_system() {
        let lib = json!({
            "name": "x:y:1",
            "natives": { os_name(): "natives-${arch}" },
            "downloads": { "classifiers": { "natives-64": { "url": "https://h/n.jar", "path": "n.jar" } } },
            "extract": { "exclude": ["META-INF/"] }
        });
        let json = json!({ "libraries": [lib] });
        assert_eq!(library_files(&json), vec![("https://h/n.jar".to_string(), "n.jar".to_string())]);
        assert_eq!(native_libraries(&json)[0].exclude, vec!["META-INF/"]);
    }
}
