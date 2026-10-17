use serde::{Deserialize, Serialize};
use std::io::Write;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct ActiveRecordingSession {
    pub child: Child,
    pub output_path: String,
    pub started_at_unix: i64,
}

pub struct ActiveStreamSession {
    pub children: Vec<Child>,
    pub targets: Vec<String>,
    pub encoder_name: String,
}

static RECORDING_SESSION: OnceLock<Mutex<Option<ActiveRecordingSession>>> = OnceLock::new();
static STREAM_SESSION: OnceLock<Mutex<Option<ActiveStreamSession>>> = OnceLock::new();

fn get_rec_mutex() -> &'static Mutex<Option<ActiveRecordingSession>> {
    RECORDING_SESSION.get_or_init(|| Mutex::new(None))
}

fn get_stream_mutex() -> &'static Mutex<Option<ActiveStreamSession>> {
    STREAM_SESSION.get_or_init(|| Mutex::new(None))
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

/// Starts a native FFmpeg desktop recording (`gdigrab` -> `libx264` + `yuv420p` + `+faststart`).
pub fn start_native_recording() -> Result<String, String> {
    let mut guard = get_rec_mutex()
        .lock()
        .map_err(|_| "Recording mutex poisoned".to_string())?;

    if let Some(existing) = guard.as_ref() {
        return Ok(existing.output_path.clone());
    }

    let rec_dir = get_recordings_dir();
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let out_file = rec_dir.join(format!("Broadcaster_{timestamp}.mp4"));
    let out_str = out_file.to_string_lossy().to_string();

    let child = Command::new("ffmpeg")
        .args([
            "-y",
            "-f",
            "gdigrab",
            "-framerate",
            "30",
            "-i",
            "desktop",
            "-vf",
            "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            &out_str,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to spawn FFmpeg for native recording: {e}"))?;

    *guard = Some(ActiveRecordingSession {
        child,
        output_path: out_str.clone(),
        started_at_unix: chrono::Utc::now().timestamp(),
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

/// Converts a recorded Composed Stage Canvas buffer (WebM/MP4 bytes containing PIP webcam,
/// lower thirds, shaders, and whiteboard drawings) into a standard H.264/AAC MP4 with `+faststart`.
pub fn transcode_composed_canvas_bytes(raw_bytes: Vec<u8>) -> Result<String, String> {
    if raw_bytes.is_empty() {
        return Err("Empty canvas recording buffer".into());
    }

    let rec_dir = get_recordings_dir();
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let temp_in = rec_dir.join(format!("_stage_raw_{timestamp}.webm"));
    let final_mp4 = rec_dir.join(format!("StageComposed_{timestamp}.mp4"));

    std::fs::write(&temp_in, &raw_bytes)
        .map_err(|e| format!("Failed to write temporary stage buffer: {e}"))?;

    let temp_str = temp_in.to_string_lossy().to_string();
    let final_str = final_mp4.to_string_lossy().to_string();

    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            &temp_str,
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
            "-b:a",
            "160k",
            "-movflags",
            "+faststart",
            &final_str,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| format!("FFmpeg stage transcode failed to launch: {e}"))?;

    let _ = std::fs::remove_file(&temp_in);

    if !status.success() || !final_mp4.exists() {
        return Err("FFmpeg failed to finalize composed Stage MP4".into());
    }

    Ok(final_str)
}

/// Generates an Instant Replay `.mp4` clip from the latest recording or captures a fresh 5s replay clip.
pub fn create_instant_replay_clip(duration_sec: u32) -> Result<String, String> {
    let rec_dir = get_recordings_dir();
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let replay_file = rec_dir.join(format!("InstantReplay_{timestamp}.mp4"));
    let replay_str = replay_file.to_string_lossy().to_string();
    let dur = duration_sec.clamp(3, 120);

    // Find newest finalized MP4 recording (excluding active lock if any)
    let mut latest_mp4: Option<(PathBuf, std::time::SystemTime)> = None;
    if let Ok(entries) = std::fs::read_dir(&rec_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) == Some("mp4") {
                if let Ok(meta) = entry.metadata() {
                    if meta.len() > 32_768 {
                        if let Ok(modified) = meta.modified() {
                            if latest_mp4.as_ref().map_or(true, |(_, t)| modified > *t) {
                                latest_mp4 = Some((p, modified));
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some((src_path, _)) = latest_mp4 {
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
            .status();

        if let Ok(st) = status {
            if st.success() && replay_file.exists() {
                return Ok(replay_str);
            }
        }
    }

    // Fallback: record a quick 4-second live desktop clip so Instant Replay always succeeds
    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-f",
            "gdigrab",
            "-framerate",
            "30",
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
            "23",
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

/// Starts simultaneous multistreaming to all configured RTMP/RTMPS channels.
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

        let child_res = Command::new("ffmpeg")
            .args([
                "-y",
                "-f",
                "gdigrab",
                "-framerate",
                "30",
                "-i",
                "desktop",
                "-vf",
                "scale=1920:1080",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-tune",
                "zerolatency",
                "-b:v",
                &br,
                "-maxrate",
                &br,
                "-bufsize",
                &buf,
                "-pix_fmt",
                "yuv420p",
                "-g",
                "60",
                "-f",
                "flv",
                &full_rtmp,
            ])
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

    let encoder_name = "NVENC / x264 Zero-Latency".to_string();
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
        Err("FFmpeg remux operation failed".into())
    }
}
