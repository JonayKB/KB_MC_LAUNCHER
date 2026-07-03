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
    let total_ram_mb = get_total_ram_mb();
    let cpu_cores    = num_cpus::get();
    let os           = std::env::consts::OS.to_string();

    log::info!(
        "[sysinfo] RAM total: {} MB | Cores: {} | OS: {}",
        total_ram_mb, cpu_cores, os
    );

    SystemInfo { total_ram_mb, cpu_cores, os }
}

pub fn recommend_settings(info: &SystemInfo) -> RecommendedSettings {
    // ── RAM ───────────────────────────────────────────────────
    // Reservamos al menos 2 GB para el OS, el resto disponible para Minecraft
    let available_for_mc = info.total_ram_mb.saturating_sub(2048);

    // Max RAM: 50% de la RAM total, mínimo 2GB, máximo 16GB
    let max_ram_mb = (available_for_mc / 2)
        .max(2048)
        .min(16384) as u32;

    // Min RAM: 25% del max, mínimo 512MB
    let min_ram_mb = (max_ram_mb / 4).max(512);

    log::info!(
        "[sysinfo] RAM recomendada: min {}MB, max {}MB (RAM total: {}MB)",
        min_ram_mb, max_ram_mb, info.total_ram_mb
    );

    // ── JVM args según hardware ───────────────────────────────
    let mut args: Vec<String> = Vec::new();

    // GC según RAM disponible
    if max_ram_mb >= 8192 {
        // Mucha RAM: ZGC es mejor para modpacks pesados (Forge 1.20+)
        args.push("-XX:+UseZGC".to_string());
        args.push("-XX:+ZGenerational".to_string());
        log::info!("[sysinfo] GC: ZGC (RAM alta)");
    } else if max_ram_mb >= 4096 {
        // RAM media: G1GC con ajuste fino
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
        log::info!("[sysinfo] GC: G1GC ajustado (RAM media)");
    } else {
        // RAM baja: G1GC básico
        args.push("-XX:+UseG1GC".to_string());
        args.push("-XX:MaxGCPauseMillis=200".to_string());
        log::info!("[sysinfo] GC: G1GC básico (RAM baja)");
    }

    // Optimizaciones de compilación JIT según cores
    if info.cpu_cores >= 8 {
        args.push(format!("-XX:ConcGCThreads={}", info.cpu_cores / 4));
        args.push(format!("-XX:ParallelGCThreads={}", info.cpu_cores / 2));
        args.push("-XX:+UseStringDeduplication".to_string());
        log::info!("[sysinfo] Threads GC: {}/{}", info.cpu_cores / 4, info.cpu_cores / 2);
    } else if info.cpu_cores >= 4 {
        args.push("-XX:ConcGCThreads=2".to_string());
        args.push("-XX:ParallelGCThreads=2".to_string());
    }

    // Optimizaciones generales siempre útiles
    args.push("-XX:+DisableExplicitGC".to_string());
    args.push("-XX:AllocatePrefetchStyle=1".to_string());
    args.push("-Dfml.readTimeout=120".to_string());
    args.push("-Dfml.loginTimeout=120".to_string());

    // Ajuste de memoria NIO (evita OOM en modpacks con muchos recursos)
    let nio_size = if max_ram_mb >= 8192 { 512 } else { 256 };
    args.push(format!("-XX:MaxDirectMemorySize={}M", nio_size));

    let extra_jvm_args = args.join(" ");
    log::info!("[sysinfo] Args recomendados generados ({} args)", args.len());

    RecommendedSettings {
        min_ram_mb,
        max_ram_mb,
        extra_jvm_args,
        total_ram_mb: info.total_ram_mb, 
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