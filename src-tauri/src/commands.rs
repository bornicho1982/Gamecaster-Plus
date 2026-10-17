use crate::engine::{
    telemetry::{sample_hardware_telemetry, HardwareTelemetry},
    video_encoder::{
        append_canvas_recording_chunk, create_instant_replay_clip, express_cut_video,
        finalize_canvas_recording_file, get_base_media_dir, get_presentations_dir,
        get_recordings_dir, get_screenshots_dir, list_dshow_audio_devices, remux_and_repair_mp4,
        start_canvas_recording_file, start_multistream_session, start_native_recording,
        stop_multistream_session, stop_native_recording, transcode_composed_canvas_bytes,
        RecordingConfig, StreamTargetConfig,
    },
    wgc_capture::{
        capture_desktop_jpeg_base64, capture_window_jpeg_base64, enumerate_monitors,
        enumerate_visible_windows, get_foreground_window_info, save_fullscreen_screenshot,
        set_process_windows_exclude_from_capture, MonitorInfo, WindowInfo,
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
pub async fn set_exclude_from_capture(exclude: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_process_windows_exclude_from_capture(exclude))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_hardware_telemetry() -> Result<HardwareTelemetry, String> {
    tauri::async_runtime::spawn_blocking(sample_hardware_telemetry)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_monitors() -> Result<Vec<MonitorInfo>, String> {
    tauri::async_runtime::spawn_blocking(enumerate_monitors)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn capture_live_frame(
    width: Option<u32>,
    height: Option<u32>,
    show_cursor: Option<bool>,
    monitor_index: Option<usize>,
) -> Result<String, String> {
    let w = width.unwrap_or(960);
    let h = height.unwrap_or(540);
    let cur = show_cursor.unwrap_or(true);
    let mon = monitor_index.unwrap_or(0);
    tauri::async_runtime::spawn_blocking(move || capture_desktop_jpeg_base64(w, h, cur, mon))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn capture_window_frame(
    hwnd: isize,
    width: Option<u32>,
    height: Option<u32>,
    show_cursor: Option<bool>,
    fallback_title: Option<String>,
) -> Result<String, String> {
    let w = width.unwrap_or(960);
    let h = height.unwrap_or(540);
    let cur = show_cursor.unwrap_or(true);
    tauri::async_runtime::spawn_blocking(move || {
        capture_window_jpeg_base64(hwnd, w, h, cur, fallback_title.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_open_windows() -> Result<Vec<WindowInfo>, String> {
    tauri::async_runtime::spawn_blocking(enumerate_visible_windows)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_active_window_info() -> Result<Option<WindowInfo>, String> {
    tauri::async_runtime::spawn_blocking(get_foreground_window_info)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_audio_capture_devices() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(list_dshow_audio_devices)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn take_screenshot() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let dir = get_screenshots_dir();
        save_fullscreen_screenshot(&dir)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn start_recording(config: Option<RecordingConfig>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || start_native_recording(config))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn stop_recording() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(stop_native_recording)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn init_canvas_recording() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(start_canvas_recording_file)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn append_canvas_chunk(temp_path: String, base64_chunk: String) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        append_canvas_recording_chunk(&temp_path, &base64_chunk)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn finalize_canvas_recording(
    temp_path: String,
    encoder: Option<String>,
    bitrate_kbps: Option<u32>,
    format: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        finalize_canvas_recording_file(
            &temp_path,
            encoder.as_deref(),
            bitrate_kbps,
            format.as_deref(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_composed_canvas_recording(bytes: Vec<u8>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || transcode_composed_canvas_bytes(bytes))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn trigger_instant_replay(duration_sec: Option<u32>) -> Result<String, String> {
    let dur = duration_sec.unwrap_or(30);
    tauri::async_runtime::spawn_blocking(move || create_instant_replay_clip(dur))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn start_multistream(targets: Vec<StreamTargetConfig>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || start_multistream_session(targets))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn stop_multistream() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(stop_multistream_session)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_media_files() -> Result<Vec<MediaFileEntry>, String> {
    tauri::async_runtime::spawn_blocking(|| {
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
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_media_file_bytes(path: String) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::read(&path).map_err(|e| format!("Failed to read media file '{path}': {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_media_file(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&path);
        if p.exists() {
            std::fs::remove_file(p).map_err(|e| format!("Cannot delete file: {e}"))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn lossless_cut_video(
    path: String,
    start_sec: f64,
    end_sec: f64,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || express_cut_video(&path, start_sec, end_sec))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn optimize_mp4_faststart(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || remux_and_repair_mp4(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn open_media_folder(sub: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_bpres_presentation(filename: String, content: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn load_bpres_presentation(filename: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = get_presentations_dir();
        let target = if let Some(name) = filename {
            dir.join(name)
        } else {
            dir.join("Placements.bpres")
        };
        std::fs::read_to_string(&target)
            .map_err(|e| format!("Presentation file not found ({}): {e}", target.display()))
    })
    .await
    .map_err(|e| e.to_string())?
}
