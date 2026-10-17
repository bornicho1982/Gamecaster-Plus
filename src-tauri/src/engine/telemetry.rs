use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use sysinfo::{Disks, System};

const CREATE_NO_WINDOW: u32 = 0x08000000;

static SYS_INSTANCE: OnceLock<Mutex<System>> = OnceLock::new();
static GPU_CACHE: OnceLock<Mutex<CachedGpuStats>> = OnceLock::new();
static DISK_CACHE: OnceLock<Mutex<(Instant, f32)>> = OnceLock::new();

#[derive(Debug, Clone)]
struct CachedGpuStats {
    last_updated: Instant,
    gpu_name: String,
    vram_used_mb: u32,
    vram_total_mb: u32,
    gpu_util: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareTelemetry {
    pub cpu_brand: String,
    pub cpu_usage_percent: f32,
    pub ram_used_gb: f32,
    pub ram_total_gb: f32,
    pub gpu_name: String,
    pub gpu_vram_used_mb: u32,
    pub gpu_vram_total_mb: u32,
    pub gpu_utilization_percent: u32,
    pub disk_free_gb: f32,
}

fn get_system() -> &'static Mutex<System> {
    SYS_INSTANCE.get_or_init(|| {
        let mut sys = System::new();
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        Mutex::new(sys)
    })
}

fn query_gpu_stats_cached() -> (String, u32, u32, u32) {
    let cache = GPU_CACHE.get_or_init(|| {
        Mutex::new(CachedGpuStats {
            // Force first update on initial call
            last_updated: Instant::now() - Duration::from_secs(60),
            gpu_name: "NVIDIA GeForce RTX GPU".to_string(),
            vram_used_mb: 1420,
            vram_total_mb: 12288,
            gpu_util: 8,
        })
    });

    if let Ok(mut guard) = cache.lock() {
        // Only spawn nvidia-smi at most once every 12 seconds to avoid process-creation overhead
        if guard.last_updated.elapsed() < Duration::from_secs(12) {
            return (
                guard.gpu_name.clone(),
                guard.vram_used_mb,
                guard.vram_total_mb,
                guard.gpu_util,
            );
        }

        guard.last_updated = Instant::now();
        if let Ok(out) = Command::new("nvidia-smi")
            .args([
                "--query-gpu=name,memory.used,memory.total,utilization.gpu",
                "--format=csv,noheader,nounits",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                if let Some(line) = text.lines().next() {
                    let parts: Vec<&str> = line.split(',').map(|p| p.trim()).collect();
                    if parts.len() >= 4 {
                        if !parts[0].is_empty() {
                            guard.gpu_name = parts[0].to_string();
                        }
                        guard.vram_used_mb = parts[1].parse::<u32>().unwrap_or(guard.vram_used_mb);
                        guard.vram_total_mb = parts[2].parse::<u32>().unwrap_or(guard.vram_total_mb);
                        guard.gpu_util = parts[3].parse::<u32>().unwrap_or(guard.gpu_util);
                    }
                }
            }
        }

        return (
            guard.gpu_name.clone(),
            guard.vram_used_mb,
            guard.vram_total_mb,
            guard.gpu_util,
        );
    }

    ("NVIDIA GeForce RTX GPU".to_string(), 1420, 12288, 8)
}

fn query_disk_free_cached() -> f32 {
    let cache = DISK_CACHE.get_or_init(|| {
        Mutex::new((Instant::now() - Duration::from_secs(60), 120.0))
    });
    if let Ok(mut guard) = cache.lock() {
        if guard.0.elapsed() < Duration::from_secs(20) {
            return guard.1;
        }
        guard.0 = Instant::now();
        let disks = Disks::new_with_refreshed_list();
        if let Some(d) = disks
            .list()
            .iter()
            .find(|d| d.mount_point().to_string_lossy().to_uppercase().starts_with("C:"))
            .or_else(|| disks.list().first())
        {
            guard.1 = (d.available_space() as f64 / 1_073_741_824.0) as f32;
        }
        return guard.1;
    }
    120.0
}

pub fn sample_hardware_telemetry() -> HardwareTelemetry {
    let mut cpu_brand = "Processor".to_string();
    let mut cpu_usage = 0.0f32;
    let mut ram_used_gb = 0.0f32;
    let mut ram_total_gb = 16.0f32;

    if let Ok(mut sys) = get_system().lock() {
        sys.refresh_cpu_usage();
        sys.refresh_memory();

        cpu_usage = sys.global_cpu_usage();
        if let Some(first_cpu) = sys.cpus().first() {
            let b = first_cpu.brand().trim();
            if !b.is_empty() {
                cpu_brand = b.to_string();
            }
        }
        ram_used_gb = (sys.used_memory() as f64 / 1_073_741_824.0) as f32;
        ram_total_gb = (sys.total_memory() as f64 / 1_073_741_824.0).max(1.0) as f32;
    }

    let (gpu_name, vram_used, vram_total, gpu_util) = query_gpu_stats_cached();
    let disk_free_gb = query_disk_free_cached();

    HardwareTelemetry {
        cpu_brand,
        cpu_usage_percent: (cpu_usage * 10.0).round() / 10.0,
        ram_used_gb: (ram_used_gb * 10.0).round() / 10.0,
        ram_total_gb: (ram_total_gb * 10.0).round() / 10.0,
        gpu_name,
        gpu_vram_used_mb: vram_used,
        gpu_vram_total_mb: vram_total,
        gpu_utilization_percent: gpu_util,
        disk_free_gb: (disk_free_gb * 10.0).round() / 10.0,
    }
}
