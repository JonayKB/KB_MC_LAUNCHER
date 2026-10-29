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
pub fn recommend_settings(info: &SystemInfo) -> RecommendedSettings {
    let total = info.total_ram_mb;
    let (window_width, window_height) = recommend_resolution(info.screen_width, info.screen_height);

    // Max RAM: 50% de la RAM total directamente
    // Mínimo 2GB, máximo 16GB
    let max_ram_mb = (total / 2).max(2048).min(16384) as u32;

    if total.saturating_sub(max_ram_mb as u64) < 2048 {
        warn!(
            "[sysinfo] RAM máxima recomendada ({} MB) deja menos de 2GB para el OS",
            max_ram_mb
        );
    }

    // Min RAM: 25% del max, mínimo 512MB
    let min_ram_mb = (max_ram_mb / 4).max(512);

    info!(
        "[sysinfo] RAM recomendada: min {}MB max {}MB (total: {}MB)",
        min_ram_mb, max_ram_mb, total
    );

    // ── GC según RAM ──────────────────────────────────────────
    let mut args: Vec<String> = Vec::new();

    if max_ram_mb >= 7680 {
        // ZGC — desde Java 21 es generacional por defecto, no necesita flag extra
        args.push("-XX:+UseZGC".to_string());
        // ZGenerational eliminado en Java 24, no añadirlo
        // UseStringDeduplication no compatible con ZGC, no añadirlo
        info!("[sysinfo] GC: ZGC (max RAM >= 7680MB, ~16GB físicos)");
    } else if max_ram_mb >= 3840 {
        args.push("-XX:+UseG1GC".to_string());
        args.push("-XX:+ParallelRefProcEnabled".to_string());
        args.push("-XX:MaxGCPauseMillis=200".to_string());
        args.push("-XX:+UnlockExperimentalVMOptions".to_string());
        args.push("-XX:G1NewSizePercent=20".to_string());
        args.push("-XX:G1ReservePercent=20".to_string());
        args.push("-XX:G1HeapRegionSize=32M".to_string());
        args.push("-XX:G1HeapWastePercent=5".to_string());
        args.push("-XX:G1MixedGCCountTarget=4".to_string());
        args.push("-XX:InitiatingHeapOccupancyPercent=15".to_string());
        args.push("-XX:G1MixedGCLiveThresholdPercent=90".to_string());
        args.push("-XX:G1RSetUpdatingPauseTimePercent=5".to_string());
        args.push("-XX:SurvivorRatio=32".to_string());
        args.push("-XX:+UseStringDeduplication".to_string()); // solo G1GC
        info!("[sysinfo] GC: G1GC ajustado (max RAM 3840-7680MB)");
    } else {
        args.push("-XX:+UseG1GC".to_string());
        args.push("-XX:MaxGCPauseMillis=200".to_string());
        info!("[sysinfo] GC: G1GC básico (max RAM < 3840MB)");
    }

    // Threads — solo para G1GC, ZGC los gestiona automáticamente
    if max_ram_mb < 7680 {
        if info.cpu_cores >= 8 {
            args.push(format!("-XX:ConcGCThreads={}", info.cpu_cores / 4));
            args.push(format!("-XX:ParallelGCThreads={}", info.cpu_cores / 2));
        } else if info.cpu_cores >= 4 {
            args.push("-XX:ConcGCThreads=2".to_string());
            args.push("-XX:ParallelGCThreads=2".to_string());
        }
    }

    // ── Optimizaciones generales ──────────────────────────────
    args.push("-XX:+DisableExplicitGC".to_string());
    args.push("-XX:AllocatePrefetchStyle=1".to_string());
    args.push("-Dfml.readTimeout=120".to_string());
    args.push("-Dfml.loginTimeout=120".to_string());

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
