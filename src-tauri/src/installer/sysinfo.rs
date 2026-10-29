use serde::Serialize;
use tauri::AppHandle;
use tauri::Manager;
use tracing::{info, warn};

#[derive(Debug, Clone, Serialize)]
pub struct SystemInfo {
    pub total_ram_mb: u64,
    pub cpu_cores: usize,
    pub os: String,
    pub screen_height: u32,
    pub screen_width: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecommendedSettings {
    pub min_ram_mb: u32,
    pub max_ram_mb: u32,
    pub extra_jvm_args: String,
    pub total_ram_mb: u64,
    pub window_width: u32,
    pub window_height: u32,
    pub fullscreen: bool,
}

pub fn get_system_info(app: &AppHandle) -> SystemInfo {
    let total_ram_mb = get_total_ram_mb();
    let total_ram_mb = ((total_ram_mb + 512) / 1024) * 1024;
    let cpu_cores = num_cpus::get();
    let os = std::env::consts::OS.to_string();

    let (screen_width, screen_height) = get_primary_screen_size(app);

    info!(
        "[sysinfo] RAM: {}MB | Cores: {} | OS: {} | Pantalla: {}x{}",
        total_ram_mb, cpu_cores, os, screen_width, screen_height
    );

    SystemInfo {
        total_ram_mb,
        cpu_cores,
        os,
        screen_width,
        screen_height,
    }
}

fn get_primary_screen_size(app: &AppHandle) -> (u32, u32) {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(monitors) = window.available_monitors() {
            if let Some(primary) = monitors.iter().find(|_m| true) {
                let size = primary.size();
                let (w, h) = (size.width, size.height);
                info!("[sysinfo] Pantalla principal: {}x{}", w, h);
                return (w, h);
            }
        }
    }

    warn!("[sysinfo] No se pudo obtener resolución, usando 1920x1080");
    (1920, 1080)
}
fn recommend_resolution(screen_w: u32, screen_h: u32) -> (u32, u32) {
    // Buscar el preset más cercano al 75% de la pantalla
    let target_w = (screen_w as f32 * 0.75) as u32;
    let target_h = (screen_h as f32 * 0.75) as u32;

    // Presets estándar ordenados de mayor a menor
    let presets = [
        (2560, 1440),
        (1920, 1080),
        (1600, 900),
        (1280, 720),
        (854, 480),
    ];

    // Usar el preset más grande que quepa en el 75% de la pantalla
    for (w, h) in presets {
        if w <= target_w && h <= target_h {
            return (w, h);
        }
    }

    // Fallback: 854x480
    (854, 480)
}
/// Recolector de basura elegido para una partida
#[derive(Debug, PartialEq, Eq)]
pub struct GcChoice {
    pub name: &'static str,
    pub args: Vec<String>,
}

/// Elige el recolector de basura según la versión de Java y la RAM asignada.
///
/// - Java 21+ con 8GB o más: ZGC generacional, pausas de menos de 1ms.
///   En Java 21-22 hay que activarlo con `-XX:+ZGenerational`; desde la 23 es
///   el modo por defecto y en la 24 el flag ya no existe.
/// - Resto: G1 ajustado para Minecraft (flags de Aikar) si hay 4GB o más,
///   o G1 básico con menos memoria.
pub fn gc_args(java_major: u32, max_ram_mb: u32, cpu_cores: usize) -> GcChoice {
    if java_major >= 21 && max_ram_mb >= 8192 {
        let mut args = vec!["-XX:+UseZGC".to_string()];
        if java_major < 23 {
            args.push("-XX:+ZGenerational".to_string());
        }
        return GcChoice { name: "ZGC generacional", args };
    }

    let mut args: Vec<String> = vec![
        "-XX:+UseG1GC".to_string(),
        "-XX:+ParallelRefProcEnabled".to_string(),
        "-XX:MaxGCPauseMillis=200".to_string(),
    ];
    let name = if max_ram_mb >= 4096 {
        args.extend(
            [
                "-XX:+UnlockExperimentalVMOptions",
                "-XX:G1NewSizePercent=30",
                "-XX:G1MaxNewSizePercent=40",
                "-XX:G1HeapRegionSize=8M",
                "-XX:G1ReservePercent=20",
                "-XX:G1HeapWastePercent=5",
                "-XX:G1MixedGCCountTarget=4",
                "-XX:InitiatingHeapOccupancyPercent=15",
                "-XX:G1MixedGCLiveThresholdPercent=90",
                "-XX:G1RSetUpdatingPauseTimePercent=5",
                "-XX:SurvivorRatio=32",
                "-XX:MaxTenuringThreshold=1",
            ]
            .map(String::from),
        );
        "G1 optimizado"
    } else {
        "G1 básico"
    };

    if cpu_cores >= 8 {
        args.push(format!("-XX:ConcGCThreads={}", cpu_cores / 4));
        args.push(format!("-XX:ParallelGCThreads={}", cpu_cores / 2));
    } else if cpu_cores >= 4 {
        args.push("-XX:ConcGCThreads=2".to_string());
        args.push("-XX:ParallelGCThreads=2".to_string());
    }

    GcChoice { name, args }
}

/// RAM máxima recomendada para Minecraft con mods según la RAM total.
///
/// No crece en proporción: por encima de ~12GB un modpack no va más rápido y
/// el recolector de basura tarda más; y con poca RAM hay que dejar margen al
/// sistema operativo. 8GB → 4GB · 16GB → 8GB · 32GB o más → 12GB.
pub fn recommend_max_ram_mb(total_mb: u64) -> u32 {
    let total_gb = (total_mb + 512) / 1024;
    let gb = match total_gb {
        0..=4 => 2,
        5..=6 => 3,
        7..=8 => 4,
        9..=12 => 6,
        13..=16 => 8,
        17..=24 => 10,
        _ => 12,
    };
    gb * 1024
}

pub fn recommend_settings(info: &SystemInfo) -> RecommendedSettings {
    let total = info.total_ram_mb;
    let (window_width, window_height) = recommend_resolution(info.screen_width, info.screen_height);

    let max_ram_mb = recommend_max_ram_mb(total);

    if total.saturating_sub(max_ram_mb as u64) < 2048 {
        warn!(
            "[sysinfo] RAM máxima recomendada ({} MB) deja menos de 2GB para el OS",
            max_ram_mb
        );
    }

    // Min RAM (Xms): la mitad del máximo, sin pasar de 4GB. Reservar de golpe
    // demasiada memoria solo alarga el arranque sin mejorar el rendimiento.
    let min_ram_mb = (max_ram_mb / 2).clamp(1024, 4096);

    info!(
        "[sysinfo] RAM recomendada: min {}MB max {}MB (total: {}MB)",
        min_ram_mb, max_ram_mb, total
    );

    // El recolector de basura no se fija aquí: depende de la versión de Java
    // del modpack y de la RAM elegida, así que lo decide el launcher al lanzar
    // (ver `gc_args`).
    // ── Optimizaciones generales ──────────────────────────────
    let mut args: Vec<String> = vec![
        "-XX:+DisableExplicitGC".to_string(),
        "-XX:AllocatePrefetchStyle=1".to_string(),
        "-Dfml.readTimeout=120".to_string(),
        "-Dfml.loginTimeout=120".to_string(),
    ];

    let nio_size = if max_ram_mb >= 8192 { 512 } else { 256 };
    args.push(format!("-XX:MaxDirectMemorySize={}M", nio_size));

    info!("[sysinfo] {} args JVM generados", args.len());

    RecommendedSettings {
        min_ram_mb,
        max_ram_mb,
        extra_jvm_args: args.join(" "),
        total_ram_mb: total,
        window_width,
        window_height,
        fullscreen: false,
    }
}

// ── OS-specific RAM detection ─────────────────────────────────

#[cfg(target_os = "linux")]
fn get_total_ram_mb() -> u64 {
    // Leer /proc/meminfo
    if let Ok(content) = std::fs::read_to_string("/proc/meminfo") {
        for line in content.lines() {
            if line.starts_with("MemTotal:") {
                let kb: u64 = line
                    .split_whitespace()
                    .nth(1)
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(0);
                return kb / 1024;
            }
        }
    }
    warn!("[sysinfo] No se pudo leer /proc/meminfo, asumiendo 4GB");
    4096
}

#[cfg(target_os = "windows")]
fn get_total_ram_mb() -> u64 {
    use std::mem::MaybeUninit;

    #[repr(C)]
    struct MemoryStatusEx {
        dw_length: u32,
        dw_memory_load: u32,
        ull_total_phys: u64,
        ull_avail_phys: u64,
        ull_total_page_file: u64,
        ull_avail_page_file: u64,
        ull_total_virtual: u64,
        ull_avail_virtual: u64,
        ull_avail_extended_virtual: u64,
    }

    extern "system" {
        fn GlobalMemoryStatusEx(lp_buffer: *mut MemoryStatusEx) -> i32;
    }

    unsafe {
        let mut status: MaybeUninit<MemoryStatusEx> = MaybeUninit::uninit();
        let ptr = status.as_mut_ptr();
        (*ptr).dw_length = std::mem::size_of::<MemoryStatusEx>() as u32;
        if GlobalMemoryStatusEx(ptr) != 0 {
            let total = status.assume_init().ull_total_phys;
            return total / 1024 / 1024;
        }
    }
    warn!("[sysinfo] GlobalMemoryStatusEx falló, asumiendo 4GB");
    4096
}

#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
fn get_total_ram_mb() -> u64 {
    4096
}

#[cfg(test)]
mod tests {
    use super::{gc_args, recommend_max_ram_mb};

    #[test]
    fn zgc_only_with_java_21_and_enough_ram() {
        assert_eq!(gc_args(21, 8192, 8).args, vec!["-XX:+UseZGC", "-XX:+ZGenerational"]);
        // Desde Java 23 el modo generacional es el de por defecto
        assert_eq!(gc_args(25, 12288, 8).args, vec!["-XX:+UseZGC"]);
        // Java 17 (MC 1.18-1.20.4) no tiene ZGC generacional: G1
        assert_eq!(gc_args(17, 12288, 8).name, "G1 optimizado");
        assert_eq!(gc_args(21, 6144, 8).name, "G1 optimizado");
        assert_eq!(gc_args(17, 3072, 4).name, "G1 básico");
    }

    #[test]
    fn ram_recommendation_by_tier() {
        assert_eq!(recommend_max_ram_mb(4096), 2048);
        assert_eq!(recommend_max_ram_mb(8192), 4096);
        // 16GB físicos suelen reportarse algo por debajo (~15.6GB)
        assert_eq!(recommend_max_ram_mb(15_900), 8192);
        assert_eq!(recommend_max_ram_mb(16384), 8192);
        assert_eq!(recommend_max_ram_mb(32768), 12288);
        assert_eq!(recommend_max_ram_mb(65536), 12288);
    }
}
