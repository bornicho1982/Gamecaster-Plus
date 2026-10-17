pub mod commands;
pub mod engine;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Ensure media directories exist on startup
            let _ = engine::video_encoder::get_recordings_dir();
            let _ = engine::video_encoder::get_screenshots_dir();
            let _ = engine::video_encoder::get_presentations_dir();

            // Force visibility and focus of main-dashboard on startup
            if let Some(win) = app.get_webview_window("main-dashboard") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_hardware_telemetry,
            commands::capture_live_frame,
            commands::capture_window_frame,
            commands::list_open_windows,
            commands::get_active_window_info,
            commands::take_screenshot,
            commands::start_recording,
            commands::stop_recording,
            commands::save_composed_canvas_recording,
            commands::trigger_instant_replay,
            commands::start_multistream,
            commands::stop_multistream,
            commands::list_media_files,
            commands::read_media_file_bytes,
            commands::delete_media_file,
            commands::lossless_cut_video,
            commands::optimize_mp4_faststart,
            commands::open_media_folder,
            commands::save_bpres_presentation,
            commands::load_bpres_presentation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Gamecaster Plus Broadcast Studio");
}
