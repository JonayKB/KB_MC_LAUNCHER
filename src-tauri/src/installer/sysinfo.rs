use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct SystemInfo {
    pub total_ram_mb: u64,
    pub cpu_cores: usize,
    pub os: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecommendedSettings {
    pub min_ram_mb: u32,
    pub max_ram_mb: u32,
    pub extra_jvm_args: String,
    pub total_ram_mb: u64,  
}


pub fn get_system_info() -> SystemInfo {
    let raw_ram_mb   = get_total_ram_mb();
    let total_ram_mb = ((raw_ram_mb + 512) / 1024) * 1024;

    let cpu_cores = num_cpus::get();
    let os        = std::env::consts::OS.to_string();

    log::info!(
        "[sysinfo] RAM física: {}MB → redondeada: {}MB | Cores: {} | OS: {}",
        raw_ram_mb, total_ram_mb, cpu_cores, os
    );

    SystemInfo { total_ram_mb, cpu_cores, os }
}
pub fn recommend_settings(info: &SystemInfo) -> RecommendedSettings {
    let total = info.total_ram_mb;

    // Max RAM: 50% de la RAM total directamente
    // Mínimo 2GB, máximo 16GB
    let max_ram_mb = (total / 2)
        .max(2048)
        .min(16384) as u32;

    if total.saturating_sub(max_ram_mb as u64) < 2048 {
        log::warn!(
            "[sysinfo] RAM máxima recomendada ({} MB) deja menos de 2GB para el OS",
            max_ram_mb
        );
    }

    // Min RAM: 25% del max, mínimo 512MB
    let min_ram_mb = (max_ram_mb / 4).max(512);

    log::info!(
        "[sysinfo] RAM recomendada: min {}MB max {}MB (total: {}MB)",
        min_ram_mb, max_ram_mb, total
    );

    // ── GC según RAM ──────────────────────────────────────────
    let mut args: Vec<String> = Vec::new();

    if max_ram_mb >= 7680 {
        // 16GB+ → ZGC generacional, mínimas pausas
        args.push("-XX:+UseZGC".to_string());
        args.push("-XX:+ZGenerational".to_string());
        log::info!("[sysinfo] GC: ZGC generacional (max RAM >= 8GB)");
    } else if max_ram_mb >= 4096 {
        // 8GB → G1GC ajustado
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
        log::info!("[sysinfo] GC: G1GC ajustado (max RAM 4-8GB)");
    } else {
        // < 4GB → G1GC básico
        args.push("-XX:+UseG1GC".to_string());
        args.push("-XX:MaxGCPauseMillis=200".to_string());
        log::info!("[sysinfo] GC: G1GC básico (max RAM < 4GB)");
    }

    // ── Threads según cores ───────────────────────────────────
    if info.cpu_cores >= 8 {
        args.push(format!("-XX:ConcGCThreads={}", info.cpu_cores / 4));
        args.push(format!("-XX:ParallelGCThreads={}", info.cpu_cores / 2));
        args.push("-XX:+UseStringDeduplication".to_string());
    } else if info.cpu_cores >= 4 {
        args.push("-XX:ConcGCThreads=2".to_string());
        args.push("-XX:ParallelGCThreads=2".to_string());
    }

    // ── Optimizaciones generales ──────────────────────────────
    args.push("-XX:+DisableExplicitGC".to_string());
    args.push("-XX:AllocatePrefetchStyle=1".to_string());
    args.push("-Dfml.readTimeout=120".to_string());
    args.push("-Dfml.loginTimeout=120".to_string());

    let nio_size = if max_ram_mb >= 8192 { 512 } else { 256 };
    args.push(format!("-XX:MaxDirectMemorySize={}M", nio_size));

    log::info!("[sysinfo] {} args JVM generados", args.len());

    RecommendedSettings {
        min_ram_mb,
        max_ram_mb,
        extra_jvm_args: args.join(" "),
        total_ram_mb: total,
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
    log::warn!("[sysinfo] No se pudo leer /proc/meminfo, asumiendo 4GB");
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
    log::warn!("[sysinfo] GlobalMemoryStatusEx falló, asumiendo 4GB");
    4096
}


#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
fn get_total_ram_mb() -> u64 {
    4096
}