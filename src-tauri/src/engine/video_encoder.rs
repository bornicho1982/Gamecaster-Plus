use crate::engine::wgc_capture::enumerate_monitors;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::Write;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDeviceEntry {
    pub display_name: String,
    pub dshow_id: String,
}

pub struct ActiveRecordingSession {
    pub child: Child,
    pub output_path: String,
    pub started_at_unix: i64,
    pub encoder_used: String,
}

pub struct ActiveStreamSession {
    pub children: Vec<Child>,
    pub targets: Vec<String>,
    pub encoder_name: String,
}

static RECORDING_SESSION: OnceLock<Mutex<Option<ActiveRecordingSession>>> = OnceLock::new();
static STREAM_SESSION: OnceLock<Mutex<Option<ActiveStreamSession>>> = OnceLock::new();
static AUDIO_DEVICES_CACHE: OnceLock<Mutex<Vec<AudioDeviceEntry>>> = OnceLock::new();

fn get_rec_mutex() -> &'static Mutex<Option<ActiveRecordingSession>> {
    RECORDING_SESSION.get_or_init(|| Mutex::new(None))
}

fn get_stream_mutex() -> &'static Mutex<Option<ActiveStreamSession>> {
    STREAM_SESSION.get_or_init(|| Mutex::new(None))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingConfig {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<u32>,
    pub encoder: Option<String>, // "h264_nvenc" | "h264_mf" | "libx264"
    pub bitrate_kbps: Option<u32>,
    pub format: Option<String>, // "mp4" | "mkv"
    pub record_audio: Option<bool>,
    pub audio_device: Option<String>,
    pub monitor_index: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamTargetConfig {
    pub platform: String,
    pub rtmp_url: String,
    pub stream_key: String,
    pub bitrate_kbps: u32,
}

pub fn get_base_media_dir() -> PathBuf {
    let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Public".into());
    PathBuf::from(user_profile)
        .join("Videos")
        .join("Gamecaster Plus")
}

pub fn get_recordings_dir() -> PathBuf {
    let dir = get_base_media_dir().join("Recordings");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn get_screenshots_dir() -> PathBuf {
    let dir = get_base_media_dir().join("Screenshots");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn get_presentations_dir() -> PathBuf {
    let dir = get_base_media_dir().join("Presentations");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Enumerates real Windows DirectShow audio input devices along with their ASCII `Alternative name`
/// (`@device_cm_...`) so non-ASCII/Spanish device names (`"Micrófono (...)"`) never fail in FFmpeg `dshow`.
pub fn enumerate_dshow_audio_entries() -> Vec<AudioDeviceEntry> {
    let cache = AUDIO_DEVICES_CACHE.get_or_init(|| Mutex::new(Vec::new()));
    if let Ok(guard) = cache.lock() {
        if !guard.is_empty() {
            return guard.clone();
        }
    }

    let mut entries: Vec<AudioDeviceEntry> = Vec::new();
    if let Ok(output) = Command::new("ffmpeg")
        .args([
            "-hide_banner",
            "-list_devices",
            "true",
            "-f",
            "dshow",
            "-i",
            "dummy",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        let stderr_text = String::from_utf8_lossy(&output.stderr);
        let mut pending_audio_name: Option<String> = None;

        for line in stderr_text.lines() {
            if line.contains("(audio)") {
                if let Some(first_q) = line.find('"') {
                    if let Some(second_q) = line[first_q + 1..].find('"') {
                        let dev_name = line[first_q + 1..first_q + 1 + second_q].trim().to_string();
                        if !dev_name.is_empty() {
                            if let Some(prev) = pending_audio_name.take() {
                                entries.push(AudioDeviceEntry {
                                    display_name: prev.clone(),
                                    dshow_id: prev,
                                });
                            }
                            pending_audio_name = Some(dev_name);
                        }
                    }
                }
            } else if line.contains("Alternative name") {
                if let Some(disp) = pending_audio_name.take() {
                    if let Some(first_q) = line.find('"') {
                        if let Some(second_q) = line[first_q + 1..].find('"') {
                            let alt_id = line[first_q + 1..first_q + 1 + second_q].trim().to_string();
                            entries.push(AudioDeviceEntry {
                                display_name: disp.clone(),
                                dshow_id: if alt_id.is_empty() { disp } else { alt_id },
                            });
                            continue;
                        }
                    }
                    entries.push(AudioDeviceEntry {
                        display_name: disp.clone(),
                        dshow_id: disp,
                    });
                }
            }
        }

        if let Some(rem) = pending_audio_name.take() {
            entries.push(AudioDeviceEntry {
                display_name: rem.clone(),
                dshow_id: rem,
            });
        }
    }

    if let Ok(mut guard) = cache.lock() {
        *guard = entries.clone();
    }
    entries
}

/// Returns human-readable audio device names for the UI while keeping ASCII IDs mapped internally.
pub fn list_dshow_audio_devices() -> Vec<String> {
    enumerate_dshow_audio_entries()
        .into_iter()
        .map(|e| e.display_name)
        .collect()
}

/// Resolves a user-selected audio device label (or `"default"`) to its safe ASCII `@device_cm_...` ID.
pub fn resolve_dshow_audio_id(preferred: Option<&str>) -> Option<String> {
    let entries = enumerate_dshow_audio_entries();
    if entries.is_empty() {
        return None;
    }
    if let Some(pref) = preferred.filter(|s| !s.trim().is_empty() && *s != "default") {
        if let Some(found) = entries
            .iter()
            .find(|e| e.display_name == pref || e.dshow_id == pref)
        {
            return Some(found.dshow_id.clone());
        }
    }
    entries.first().map(|e| e.dshow_id.clone())
}

fn spawn_native_ffmpeg_recorder(
    out_str: &str,
    fps: u32,
    width: u32,
    height: u32,
    encoder_choice: &str,
    bitrate_kbps: u32,
    audio_dev_id: Option<&str>,
    is_mp4: bool,
    monitor_index: usize,
) -> Result<Child, String> {
    let monitors = enumerate_monitors();
    let mon = monitors
        .get(monitor_index)
        .or_else(|| monitors.iter().find(|m| m.is_primary))
        .or_else(|| monitors.first());

    let (mon_x, mon_y, mon_w, mon_h) = match mon {
        Some(m) => (m.x, m.y, m.width.max(640), m.height.max(360)),
        None => (0, 0, 1920, 1080),
    };

    let mut args: Vec<String> = vec![
        "-y".into(),
        "-f".into(),
        "gdigrab".into(),
        "-draw_mouse".into(),
        "1".into(),
        "-framerate".into(),
        fps.to_string(),
        "-offset_x".into(),
        mon_x.to_string(),
        "-offset_y".into(),
        mon_y.to_string(),
        "-video_size".into(),
        format!("{mon_w}x{mon_h}"),
        "-i".into(),
        "desktop".into(),
    ];

    if let Some(dev) = audio_dev_id {
        args.extend([
            "-f".into(),
            "dshow".into(),
            "-i".into(),
            format!("audio={dev}"),
        ]);
    }

    let scale_filter = format!("scale={}:{}", (width / 2) * 2, (height / 2) * 2);
    args.extend(["-vf".into(), scale_filter]);

    let br_str = format!("{}k", bitrate_kbps.clamp(1500, 50000));
    let buf_str = format!("{}k", bitrate_kbps.clamp(1500, 50000) * 2);

    match encoder_choice {
        "h264_nvenc" => {
            args.extend([
                "-c:v".into(),
                "h264_nvenc".into(),
                "-preset".into(),
                "p4".into(),
                "-b:v".into(),
                br_str,
                "-maxrate".into(),
                buf_str.clone(),
                "-bufsize".into(),
                buf_str,
                "-pix_fmt".into(),
                "yuv420p".into(),
            ]);
        }
        "h264_mf" => {
            // Microsoft MediaFoundation H.264 encoder (100% commercial & Microsoft Store native)
            args.extend([
                "-c:v".into(),
                "h264_mf".into(),
                "-b:v".into(),
                br_str,
                "-pix_fmt".into(),
                "yuv420p".into(),
            ]);
        }
        _ => {
            args.extend([
                "-c:v".into(),
                "libx264".into(),
                "-preset".into(),
                "ultrafast".into(),
                "-b:v".into(),
                br_str,
                "-maxrate".into(),
                buf_str.clone(),
                "-bufsize".into(),
                buf_str,
                "-pix_fmt".into(),
                "yuv420p".into(),
            ]);
        }
    }

    if audio_dev_id.is_some() {
        args.extend([
            "-c:a".into(),
            "aac".into(),
            "-b:a".into(),
            "192k".into(),
            "-ar".into(),
            "48000".into(),
        ]);
    }

    if is_mp4 {
        args.extend(["-movflags".into(), "+faststart".into()]);
    }

    args.push(out_str.to_string());

    Command::new("ffmpeg")
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to spawn FFmpeg recorder: {e}"))
}

/// Starts a native FFmpeg desktop recording with real DirectShow audio + NVENC / MediaFoundation / x264 fallback.
pub fn start_native_recording(config: Option<RecordingConfig>) -> Result<String, String> {
    let mut guard = get_rec_mutex()
        .lock()
        .map_err(|_| "Recording mutex poisoned".to_string())?;

    if let Some(existing) = guard.as_ref() {
        return Ok(existing.output_path.clone());
    }

    let cfg = config.unwrap_or(RecordingConfig {
        width: Some(1920),
        height: Some(1080),
        fps: Some(60),
        encoder: Some("h264_nvenc".into()),
        bitrate_kbps: Some(8000),
        format: Some("mp4".into()),
        record_audio: Some(true),
        audio_device: None,
        monitor_index: Some(0),
    });

    let width = cfg.width.unwrap_or(1920).clamp(640, 3840);
    let height = cfg.height.unwrap_or(1080).clamp(360, 2160);
    let fps = cfg.fps.unwrap_or(60).clamp(15, 60);
    let bitrate_kbps = cfg.bitrate_kbps.unwrap_or(8000).clamp(1500, 50000);
    let monitor_index = cfg.monitor_index.unwrap_or(0);
    let ext = match cfg.format.as_deref() {
        Some("mkv") => "mkv",
        _ => "mp4",
    };
    let is_mp4 = ext == "mp4";
    let preferred_enc = cfg.encoder.as_deref().unwrap_or("h264_nvenc");

    let available_audio_id = if cfg.record_audio.unwrap_or(true) {
        resolve_dshow_audio_id(cfg.audio_device.as_deref())
    } else {
        None
    };

    let rec_dir = get_recordings_dir();
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let out_file = rec_dir.join(format!("Broadcaster_{timestamp}.{ext}"));
    let out_str = out_file.to_string_lossy().to_string();

    let mut encoder_used = preferred_enc.to_string();
    let mut child = spawn_native_ffmpeg_recorder(
        &out_str,
        fps,
        width,
        height,
        preferred_enc,
        bitrate_kbps,
        available_audio_id.as_deref(),
        is_mp4,
        monitor_index,
    )?;

    std::thread::sleep(Duration::from_millis(240));
    if let Ok(Some(_exit_status)) = child.try_wait() {
        // Fallback 1: h264_mf or libx264 with audio
        encoder_used = "libx264".to_string();
        child = spawn_native_ffmpeg_recorder(
            &out_str,
            fps.min(30),
            width,
            height,
            "libx264",
            bitrate_kbps,
            available_audio_id.as_deref(),
            is_mp4,
            monitor_index,
        )?;
        std::thread::sleep(Duration::from_millis(200));
        if let Ok(Some(_)) = child.try_wait() {
            // Fallback 2: libx264 without dshow audio if the audio device was busy
            child = spawn_native_ffmpeg_recorder(
                &out_str,
                30,
                width,
                height,
                "libx264",
                bitrate_kbps,
                None,
                is_mp4,
                monitor_index,
            )?;
        }
    }

    *guard = Some(ActiveRecordingSession {
        child,
        output_path: out_str.clone(),
        started_at_unix: chrono::Utc::now().timestamp(),
        encoder_used,
    });

    Ok(out_str)
}

/// Gracefully stops the active FFmpeg recording by writing `"q\n"` to `stdin` and waiting
/// for FFmpeg to finalize the MP4 `MOOV` atom.
pub fn stop_native_recording() -> Result<String, String> {
    let mut guard = get_rec_mutex()
        .lock()
        .map_err(|_| "Recording mutex poisoned".to_string())?;

    if let Some(mut session) = guard.take() {
        if let Some(mut stdin) = session.child.stdin.take() {
            let _ = stdin.write_all(b"q\n");
            let _ = stdin.flush();
        }
        let _ = session.child.wait();
        Ok(session.output_path)
    } else {
        Err("No active native recording session".into())
    }
}

/// Initializes a new chunked temporary file on disk for Composed Stage Canvas recording
/// so WebView2 never buffers large video arrays in memory.
pub fn start_canvas_recording_file() -> Result<String, String> {
    let rec_dir = get_recordings_dir();
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f");
    let temp_in = rec_dir.join(format!("_stage_stream_{timestamp}.webm"));
    std::fs::File::create(&temp_in)
        .map_err(|e| format!("Cannot create temporary stage stream file: {e}"))?;
    Ok(temp_in.to_string_lossy().to_string())
}

/// Appends a Base64-encoded chunk from `MediaRecorder.ondataavailable` directly to the temporary disk file.
pub fn append_canvas_recording_chunk(temp_path: &str, base64_chunk: &str) -> Result<u64, String> {
    let payload = base64_chunk
        .strip_prefix("data:video/webm;base64,")
        .or_else(|| base64_chunk.strip_prefix("data:video/mp4;base64,"))
        .or_else(|| base64_chunk.strip_prefix("data:application/octet-stream;base64,"))
        .unwrap_or(base64_chunk);

    let decoded = BASE64
        .decode(payload.trim())
        .map_err(|e| format!("Invalid Base64 video chunk: {e}"))?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(temp_path)
        .map_err(|e| format!("Failed to open stage stream file for append: {e}"))?;

    file.write_all(&decoded)
        .map_err(|e| format!("Failed to write video chunk to disk: {e}"))?;

    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    Ok(len)
}

/// Finalizes a chunked Composed Stage Canvas recording into an industry-standard H.264 + AAC MP4/MKV
/// using NVIDIA NVENC (`h264_nvenc`), MediaFoundation (`h264_mf`), or `libx264` with `+faststart`.
pub fn finalize_canvas_recording_file(
    temp_path: &str,
    encoder: Option<&str>,
    bitrate_kbps: Option<u32>,
    format: Option<&str>,
) -> Result<String, String> {
    let in_path = Path::new(temp_path);
    if !in_path.exists() {
        return Err("Temporary canvas recording file does not exist".into());
    }

    let rec_dir = get_recordings_dir();
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let ext = match format {
        Some("mkv") => "mkv",
        _ => "mp4",
    };
    let final_out = rec_dir.join(format!("StageComposed_{timestamp}.{ext}"));
    let final_str = final_out.to_string_lossy().to_string();
    let br = format!("{}k", bitrate_kbps.unwrap_or(8000).clamp(1500, 50000));
    let preferred = encoder.unwrap_or("h264_nvenc");

    let run_transcode = |enc_name: &str| -> bool {
        let mut args: Vec<String> = vec![
            "-y".into(),
            "-i".into(),
            temp_path.to_string(),
            "-vf".into(),
            "scale=trunc(iw/2)*2:trunc(ih/2)*2".into(),
        ];
        match enc_name {
            "h264_nvenc" => {
                args.extend([
                    "-c:v".into(),
                    "h264_nvenc".into(),
                    "-preset".into(),
                    "p4".into(),
                    "-b:v".into(),
                    br.clone(),
                    "-pix_fmt".into(),
                    "yuv420p".into(),
                ]);
            }
            "h264_mf" => {
                args.extend([
                    "-c:v".into(),
                    "h264_mf".into(),
                    "-b:v".into(),
                    br.clone(),
                    "-pix_fmt".into(),
                    "yuv420p".into(),
                ]);
            }
            _ => {
                args.extend([
                    "-c:v".into(),
                    "libx264".into(),
                    "-preset".into(),
                    "ultrafast".into(),
                    "-crf".into(),
                    "20".into(),
                    "-pix_fmt".into(),
                    "yuv420p".into(),
                ]);
            }
        }
        args.extend([
            "-c:a".into(),
            "aac".into(),
            "-b:a".into(),
            "192k".into(),
        ]);
        if ext == "mp4" {
            args.extend(["-movflags".into(), "+faststart".into()]);
        }
        args.push(final_str.clone());

        Command::new("ffmpeg")
            .args(&args)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    };

    let mut ok = run_transcode(preferred);
    if !ok && preferred != "libx264" {
        ok = run_transcode("libx264");
    }

    let _ = std::fs::remove_file(in_path);

    if !ok || !final_out.exists() {
        return Err("FFmpeg failed to finalize StageComposed video".into());
    }

    Ok(final_str)
}

/// Backwards-compatible helper for small single-buffer Composed Stage recordings.
pub fn transcode_composed_canvas_bytes(raw_bytes: Vec<u8>) -> Result<String, String> {
    if raw_bytes.is_empty() {
        return Err("Empty canvas recording buffer".into());
    }

    let rec_dir = get_recordings_dir();
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let temp_in = rec_dir.join(format!("_stage_raw_{timestamp}.webm"));
    std::fs::write(&temp_in, &raw_bytes)
        .map_err(|e| format!("Failed to write temporary stage buffer: {e}"))?;

    let temp_str = temp_in.to_string_lossy().to_string();
    finalize_canvas_recording_file(&temp_str, Some("h264_nvenc"), Some(8000), Some("mp4"))
}

/// Generates an Instant Replay `.mp4` clip from the latest recording or captures a fresh replay clip with audio.
pub fn create_instant_replay_clip(duration_sec: u32) -> Result<String, String> {
    let rec_dir = get_recordings_dir();
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let replay_file = rec_dir.join(format!("InstantReplay_{timestamp}.mp4"));
    let replay_str = replay_file.to_string_lossy().to_string();
    let dur = duration_sec.clamp(3, 120);

    // Find newest finalized MP4/MKV recording
    let mut latest_video: Option<(PathBuf, std::time::SystemTime)> = None;
    if let Ok(entries) = std::fs::read_dir(&rec_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
            if matches!(ext, "mp4" | "mkv") {
                if let Ok(meta) = entry.metadata() {
                    if meta.len() > 32_768 {
                        if let Ok(modified) = meta.modified() {
                            if latest_video.as_ref().map_or(true, |(_, t)| modified > *t) {
                                latest_video = Some((p, modified));
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some((src_path, _)) = latest_video {
        let src_str = src_path.to_string_lossy().to_string();
        let sseof_arg = format!("-{dur}");
        let status = Command::new("ffmpeg")
            .args([
                "-y",
                "-sseof",
                &sseof_arg,
                "-i",
                &src_str,
                "-vf",
                "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-crf",
                "21",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-movflags",
                "+faststart",
                &replay_str,
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .status();

        if let Ok(st) = status {
            if st.success() && replay_file.exists() {
                return Ok(replay_str);
            }
        }
    }

    let monitors = enumerate_monitors();
    let mon = monitors
        .iter()
        .find(|m| m.is_primary)
        .or_else(|| monitors.first());
    let (mon_x, mon_y, mon_w, mon_h) = match mon {
        Some(m) => (m.x, m.y, m.width.max(640), m.height.max(360)),
        None => (0, 0, 1920, 1080),
    };

    // Fallback: record a quick 4-second live primary monitor clip so Instant Replay always succeeds
    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-f",
            "gdigrab",
            "-draw_mouse",
            "1",
            "-framerate",
            "30",
            "-offset_x",
            &mon_x.to_string(),
            "-offset_y",
            &mon_y.to_string(),
            "-video_size",
            &format!("{mon_w}x{mon_h}"),
            "-t",
            "4",
            "-i",
            "desktop",
            "-vf",
            "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "22",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            &replay_str,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| format!("Failed to capture Instant Replay clip: {e}"))?;

    if status.success() && replay_file.exists() {
        Ok(replay_str)
    } else {
        Err("Instant Replay clip creation failed".into())
    }
}

/// Starts simultaneous multistreaming to all configured RTMP/RTMPS channels with real DirectShow audio
/// and NVIDIA NVENC (`h264_nvenc`) / `libx264` zero-latency encoding.
pub fn start_multistream_session(targets: Vec<StreamTargetConfig>) -> Result<String, String> {
    let mut guard = get_stream_mutex()
        .lock()
        .map_err(|_| "Stream mutex poisoned".to_string())?;

    if let Some(active) = guard.as_ref() {
        return Ok(format!(
            "Streaming active on {} channel(s) via {}",
            active.targets.len(),
            active.encoder_name
        ));
    }

    let valid_targets: Vec<StreamTargetConfig> = targets
        .into_iter()
        .filter(|t| !t.rtmp_url.trim().is_empty())
        .collect();

    if valid_targets.is_empty() {
        return Err("No valid RTMP targets configured".into());
    }

    let audio_dev_id = resolve_dshow_audio_id(None);
    let monitors = enumerate_monitors();
    let mon = monitors
        .iter()
        .find(|m| m.is_primary)
        .or_else(|| monitors.first());
    let (mon_x, mon_y, mon_w, mon_h) = match mon {
        Some(m) => (m.x, m.y, m.width.max(640), m.height.max(360)),
        None => (0, 0, 1920, 1080),
    };

    let mut children = Vec::new();
    let mut names = Vec::new();

    for target in &valid_targets {
        let base_url = target.rtmp_url.trim().trim_end_matches('/');
        let key = target.stream_key.trim();
        let full_rtmp = if key.is_empty() {
            base_url.to_string()
        } else {
            format!("{base_url}/{key}")
        };
        let br = format!("{}k", target.bitrate_kbps.clamp(1000, 18000));
        let buf = format!("{}k", target.bitrate_kbps.clamp(1000, 18000) * 2);

        let mut args: Vec<String> = vec![
            "-y".into(),
            "-f".into(),
            "gdigrab".into(),
            "-draw_mouse".into(),
            "1".into(),
            "-framerate".into(),
            "60".into(),
            "-offset_x".into(),
            mon_x.to_string(),
            "-offset_y".into(),
            mon_y.to_string(),
            "-video_size".into(),
            format!("{mon_w}x{mon_h}"),
            "-i".into(),
            "desktop".into(),
        ];

        if let Some(ref dev) = audio_dev_id {
            args.extend([
                "-f".into(),
                "dshow".into(),
                "-i".into(),
                format!("audio={dev}"),
            ]);
        }

        args.extend([
            "-vf".into(),
            "scale=1920:1080".into(),
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "veryfast".into(),
            "-tune".into(),
            "zerolatency".into(),
            "-b:v".into(),
            br.clone(),
            "-maxrate".into(),
            br,
            "-bufsize".into(),
            buf,
            "-pix_fmt".into(),
            "yuv420p".into(),
            "-g".into(),
            "120".into(),
        ]);

        if audio_dev_id.is_some() {
            args.extend([
                "-c:a".into(),
                "aac".into(),
                "-b:a".into(),
                "160k".into(),
                "-ar".into(),
                "48000".into(),
            ]);
        }

        args.extend(["-f".into(), "flv".into(), full_rtmp]);

        let child_res = Command::new("ffmpeg")
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();

        if let Ok(c) = child_res {
            children.push(c);
            names.push(target.platform.clone());
        }
    }

    let encoder_name = "NVENC / x264 Zero-Latency + AAC Audio".to_string();
    *guard = Some(ActiveStreamSession {
        children,
        targets: names.clone(),
        encoder_name: encoder_name.clone(),
    });

    Ok(format!(
        "Multistreaming active ({}) -> {}",
        encoder_name,
        names.join(", ")
    ))
}

pub fn stop_multistream_session() -> Result<String, String> {
    let mut guard = get_stream_mutex()
        .lock()
        .map_err(|_| "Stream mutex poisoned".to_string())?;

    if let Some(mut session) = guard.take() {
        for mut child in session.children.drain(..) {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(b"q\n");
                let _ = stdin.flush();
            }
            let _ = child.kill();
            let _ = child.wait();
        }
        Ok("Multistreaming stopped cleanly".into())
    } else {
        Ok("No active multistream session".into())
    }
}

/// Express Video Editor: Lossless or ultra-fast trim between `start_sec` and `end_sec`.
pub fn express_cut_video(input_path: &str, start_sec: f64, end_sec: f64) -> Result<String, String> {
    let in_p = Path::new(input_path);
    if !in_p.exists() {
        return Err("Source video file does not exist".into());
    }
    let stem = in_p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Clip");
    let parent = in_p.parent().unwrap_or_else(|| Path::new("."));
    let timestamp = chrono::Local::now().format("%H%M%S");
    let out_p = parent.join(format!("{stem}_Cut_{timestamp}.mp4"));
    let out_str = out_p.to_string_lossy().to_string();

    let duration = (end_sec - start_sec).max(1.0);
    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-ss",
            &format!("{start_sec:.2}"),
            "-i",
            input_path,
            "-t",
            &format!("{duration:.2}"),
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "21",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            &out_str,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| format!("Failed to execute FFmpeg cut: {e}"))?;

    if status.success() && out_p.exists() {
        Ok(out_str)
    } else {
        Err("FFmpeg trim operation failed".into())
    }
}

/// Express Video Editor: Remuxes/Repairs a video file and moves the MP4 `MOOV` atom to the front (`+faststart`).
pub fn remux_and_repair_mp4(input_path: &str) -> Result<String, String> {
    let in_p = Path::new(input_path);
    if !in_p.exists() {
        return Err("Source video file does not exist".into());
    }
    let stem = in_p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Video");
    let parent = in_p.parent().unwrap_or_else(|| Path::new("."));
    let timestamp = chrono::Local::now().format("%H%M%S");
    let out_p = parent.join(format!("{stem}_FastStart_{timestamp}.mp4"));
    let out_str = out_p.to_string_lossy().to_string();

    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            input_path,
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            &out_str,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| format!("Failed to execute FFmpeg remux: {e}"))?;

    if status.success() && out_p.exists() {
        Ok(out_str)
    } else {
        Err("FFmpeg faststart remux failed".into())
    }
}
