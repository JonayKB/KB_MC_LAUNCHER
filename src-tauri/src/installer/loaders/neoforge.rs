use crate::installer::loaders::forge::{self, LoaderInstaller};
use crate::installer::progress::Reporter;
use anyhow::Result;
use std::path::Path;

/// Id de versión que genera el instalador de NeoForge
pub fn version_id(neoforge_version: &str) -> String {
    format!("neoforge-{}", neoforge_version)
}

pub async fn install(
    reporter: &Reporter,
    versions_dir: &Path,
    mc_version: &str,
    neoforge_version: &str,
) -> Result<()> {
    let installer = LoaderInstaller {
        name: "NeoForge",
        url: format!(
            "https://maven.neoforged.net/releases/net/neoforged/neoforge/{v}/neoforge-{v}-installer.jar",
            v = neoforge_version,
        ),
        client_flag: "--install-client",
        version_id: version_id(neoforge_version),
    };
    forge::run_installer(reporter, versions_dir, mc_version, installer).await
}
