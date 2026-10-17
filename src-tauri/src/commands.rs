use crate::engine::{
    telemetry::{sample_hardware_telemetry, HardwareTelemetry},
    video_encoder::{
        create_instant_replay_clip, express_cut_video, get_base_media_dir, get_presentations_dir,
        get_recordings_dir, get_screenshots_dir, remux_and_repair_mp4, start_multistream_session,
        start_native_recording, stop_multistream_session, stop_native_recording,
        transcode_composed_canvas_bytes, StreamTargetConfig,
    },
    wgc_capture::{
        capture_desktop_jpeg_base64, capture_window_jpeg_base64, enumerate_visible_windows,
        get_foreground_window_info, save_fullscreen_screenshot, WindowInfo,
    },
};
use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaFileEntry {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub created_display: String,
    pub kind: String, // "video" | "screenshot"
}

#[tauri::command]
pub fn get_hardware_telemetry() -> HardwareTelemetry {
    sample_hardware_telemetry()
}

#[tauri::command]
pub fn capture_live_frame(width: Option<u32>, height: Option<u32>) -> Result<String, String> {
    capture_desktop_jpeg_base64(width.unwrap_or(960), height.unwrap_or(540))
}

#[tauri::command]
pub fn capture_window_frame(
    hwnd: isize,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<String, String> {
    capture_window_jpeg_base64(hwnd, width.unwrap_or(960), height.unwrap_or(540))
}

#[tauri::command]
pub fn list_open_windows() -> Vec<WindowInfo> {
    enumerate_visible_windows()
}

#[tauri::command]
pub fn get_active_window_info() -> Option<WindowInfo> {
    get_foreground_window_info()
}

#[tauri::command]
pub fn take_screenshot() -> Result<String, String> {
    let dir = get_screenshots_dir();
    save_fullscreen_screenshot(&dir)
}

#[tauri::command]
pub fn start_recording() -> Result<String, String> {
    start_native_recording()
}

#[tauri::command]
pub fn stop_recording() -> Result<String, String> {
    stop_native_recording()
}

#[tauri::command]
pub fn save_composed_canvas_recording(bytes: Vec<u8>) -> Result<String, String> {
    transcode_composed_canvas_bytes(bytes)
}

#[tauri::command]
pub fn trigger_instant_replay(duration_sec: Option<u32>) -> Result<String, String> {
    create_instant_replay_clip(duration_sec.unwrap_or(30))
}

#[tauri::command]
pub fn start_multistream(targets: Vec<StreamTargetConfig>) -> Result<String, String> {
    start_multistream_session(targets)
}

#[tauri::command]
pub fn stop_multistream() -> Result<String, String> {
    stop_multistream_session()
}

#[tauri::command]
pub fn list_media_files() -> Result<Vec<MediaFileEntry>, String> {
    let mut items: Vec<(std::time::SystemTime, MediaFileEntry)> = Vec::new();
    let rec_dir = get_recordings_dir();
    let scr_dir = get_screenshots_dir();

    for (dir, kind) in [(rec_dir, "video"), (scr_dir, "screenshot")] {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                if name.starts_with('_') {
                    continue;
                }
                let ext = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if kind == "video" && !matches!(ext.as_str(), "mp4" | "mkv" | "webm" | "flv") {
                    continue;
                }
                if kind == "screenshot" && !matches!(ext.as_str(), "png" | "jpg" | "jpeg") {
                    continue;
                }
                if let Ok(meta) = entry.metadata() {
                    let modified = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                    let dt: chrono::DateTime<chrono::Local> = modified.into();
                    items.push((
                        modified,
                        MediaFileEntry {
                            name,
                            path: path.to_string_lossy().to_string(),
                            size_bytes: meta.len(),
                            created_display: dt.format("%d/%m/%Y %H:%M:%S").to_string(),
                            kind: kind.to_string(),
                        },
                    ));
                }
            }
        }
    }

    items.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(items.into_iter().map(|(_, item)| item).collect())
}

#[tauri::command]
pub fn read_media_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Failed to read media file '{path}': {e}"))
}

#[tauri::command]
pub fn delete_media_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        std::fs::remove_file(p).map_err(|e| format!("Cannot delete file: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn lossless_cut_video(path: String, start_sec: f64, end_sec: f64) -> Result<String, String> {
    express_cut_video(&path, start_sec, end_sec)
}

#[tauri::command]
pub fn optimize_mp4_faststart(path: String) -> Result<String, String> {
    remux_and_repair_mp4(&path)
}

#[tauri::command]
pub fn open_media_folder(sub: Option<String>) -> Result<String, String> {
    let target = match sub.as_deref() {
        Some("screenshots") => get_screenshots_dir(),
        Some("presentations") => get_presentations_dir(),
        Some("recordings") => get_recordings_dir(),
        _ => get_base_media_dir(),
    };
    let path_str = target.to_string_lossy().to_string();
    let _ = Command::new("explorer")
        .arg(&path_str)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
    Ok(path_str)
}

#[tauri::command]
pub fn save_bpres_presentation(filename: String, content: String) -> Result<String, String> {
    let dir = get_presentations_dir();
    let clean_name = if filename.ends_with(".bpres") {
        filename
    } else {
        format!("{filename}.bpres")
    };
    let full_path = dir.join(clean_name);
    std::fs::write(&full_path, content)
        .map_err(|e| format!("Failed to save .bpres presentation: {e}"))?;
    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn load_bpres_presentation(filename: Option<String>) -> Result<String, String> {
    let dir = get_presentations_dir();
    let target = if let Some(name) = filename {
        dir.join(name)
    } else {
        dir.join("Placements.bpres")
    };
    std::fs::read_to_string(&target)
        .map_err(|e| format!("Presentation file not found ({}): {e}", target.display()))
}
