use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::{codecs::jpeg::JpegEncoder, ImageFormat, RgbImage};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::mem::{size_of, zeroed};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

static MONITORS_CACHE: OnceLock<Mutex<(Instant, Vec<MonitorInfo>)>> = OnceLock::new();
static WINDOW_FAST_BITBLT_SET: OnceLock<Mutex<HashSet<isize>>> = OnceLock::new();

#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    Foundation::{BOOL, HWND, LPARAM, POINT, RECT, TRUE},
    Graphics::Gdi::{
        BitBlt, ClientToScreen, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
        EnumDisplayMonitors, GetDC, GetDIBits, GetMonitorInfoW, ReleaseDC, SelectObject,
        SetStretchBltMode, StretchBlt, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, COLORONCOLOR,
        DIB_RGB_COLORS, HDC, HMONITOR, MONITORINFOEXW, SRCCOPY,
    },
    Storage::Xps::PrintWindow,
    System::Threading::GetCurrentProcessId,
    UI::WindowsAndMessaging::{
        DrawIconEx, EnumWindows, GetClientRect, GetCursorInfo, GetForegroundWindow,
        GetSystemMetrics, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible, SetWindowDisplayAffinity,
        CURSORINFO, CURSOR_SHOWING, DI_NORMAL, PW_RENDERFULLCONTENT, SM_CXSCREEN, SM_CYSCREEN,
    },
};

const WDA_NONE: u32 = 0x00000000;
const WDA_EXCLUDEFROMCAPTURE: u32 = 0x00000011;

/// Excludes or includes all top-level windows belonging to the current Gamecaster Plus process
/// from capture via Win32 `SetWindowDisplayAffinity`.
pub fn set_process_windows_exclude_from_capture(exclude: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    unsafe {
        struct AffinityCtx {
            target_pid: u32,
            affinity: u32,
        }

        unsafe extern "system" fn apply_affinity_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let ctx = &*(lparam as *const AffinityCtx);
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == ctx.target_pid {
                let _ = SetWindowDisplayAffinity(hwnd, ctx.affinity);
            }
            TRUE
        }

        let ctx = AffinityCtx {
            target_pid: GetCurrentProcessId(),
            affinity: if exclude {
                WDA_EXCLUDEFROMCAPTURE
            } else {
                WDA_NONE
            },
        };
        let _ = EnumWindows(
            Some(apply_affinity_proc),
            (&ctx as *const AffinityCtx) as LPARAM,
        );
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = exclude;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorInfo {
    pub index: usize,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowInfo {
    pub hwnd: isize,
    pub title: String,
    pub process_id: u32,
    pub width: i32,
    pub height: i32,
}

/// Enumerates all connected display monitors (`EnumDisplayMonitors`) so dual/triple monitor setups
/// can capture any specific monitor cleanly without stretching across the virtual desktop.
pub fn enumerate_monitors() -> Vec<MonitorInfo> {
    #[cfg(target_os = "windows")]
    unsafe {
        unsafe extern "system" fn monitor_enum_proc(
            hmonitor: HMONITOR,
            _hdc: HDC,
            _lprect: *mut RECT,
            lparam: LPARAM,
        ) -> BOOL {
            let list = &mut *(lparam as *mut Vec<MonitorInfo>);
            let mut mi: MONITORINFOEXW = zeroed();
            mi.monitorInfo.cbSize = size_of::<MONITORINFOEXW>() as u32;
            if GetMonitorInfoW(hmonitor, &mut mi as *mut _ as *mut _) != 0 {
                let r = mi.monitorInfo.rcMonitor;
                let w = (r.right - r.left).max(640);
                let h = (r.bottom - r.top).max(360);
                let is_primary = (mi.monitorInfo.dwFlags & 1) != 0;
                let idx = list.len();
                let dev_name = String::from_utf16_lossy(
                    &mi.szDevice
                        .iter()
                        .copied()
                        .take_while(|&c| c != 0)
                        .collect::<Vec<u16>>(),
                );
                let label = if is_primary {
                    format!("Monitor Principal #{} ({}×{})", idx + 1, w, h)
                } else {
                    format!("Monitor Secundario #{} ({}×{} • {})", idx + 1, w, h, dev_name)
                };
                list.push(MonitorInfo {
                    index: idx,
                    name: label,
                    x: r.left,
                    y: r.top,
                    width: w,
                    height: h,
                    is_primary,
                });
            }
            TRUE
        }

        let mut monitors: Vec<MonitorInfo> = Vec::new();
        let _ = EnumDisplayMonitors(
            std::ptr::null_mut(),
            std::ptr::null(),
            Some(monitor_enum_proc),
            (&mut monitors as *mut Vec<MonitorInfo>) as LPARAM,
        );

        if monitors.is_empty() {
            let w = GetSystemMetrics(SM_CXSCREEN).max(1280);
            let h = GetSystemMetrics(SM_CYSCREEN).max(720);
            monitors.push(MonitorInfo {
                index: 0,
                name: format!("Monitor Principal #1 ({w}×{h})"),
                x: 0,
                y: 0,
                width: w,
                height: h,
                is_primary: true,
            });
        }

        let cache = MONITORS_CACHE.get_or_init(|| Mutex::new((Instant::now(), Vec::new())));
        if let Ok(mut guard) = cache.lock() {
            *guard = (Instant::now(), monitors.clone());
        }
        monitors
    }

    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
}

/// Fast cached monitor lookup for high-frequency capture loop (refreshes every 6 seconds).
fn get_cached_monitors() -> Vec<MonitorInfo> {
    let cache = MONITORS_CACHE.get_or_init(|| {
        Mutex::new((
            Instant::now()
                .checked_sub(Duration::from_secs(60))
                .unwrap_or_else(Instant::now),
            Vec::new(),
        ))
    });
    if let Ok(guard) = cache.lock() {
        if !guard.1.is_empty() && guard.0.elapsed() < Duration::from_secs(6) {
            return guard.1.clone();
        }
    }
    enumerate_monitors()
}

/// Draws the live hardware mouse cursor onto `hdc_target` scaled to the capture bounds.
#[cfg(target_os = "windows")]
unsafe fn draw_cursor_on_hdc(
    hdc_target: HDC,
    src_left: i32,
    src_top: i32,
    src_w: i32,
    src_h: i32,
    dst_w: i32,
    dst_h: i32,
) {
    if src_w <= 0 || src_h <= 0 || dst_w <= 0 || dst_h <= 0 {
        return;
    }
    let mut ci: CURSORINFO = zeroed();
    ci.cbSize = size_of::<CURSORINFO>() as u32;
    if GetCursorInfo(&mut ci) != 0 && (ci.flags & CURSOR_SHOWING) != 0 && !ci.hCursor.is_null() {
        let rel_x = ci.ptScreenPos.x - src_left;
        let rel_y = ci.ptScreenPos.y - src_top;
        if rel_x >= 0 && rel_x <= src_w && rel_y >= 0 && rel_y <= src_h {
            let scaled_x = ((rel_x as i64 * dst_w as i64) / (src_w as i64)) as i32;
            let scaled_y = ((rel_y as i64 * dst_h as i64) / (src_h as i64)) as i32;
            let _ = DrawIconEx(
                hdc_target,
                scaled_x,
                scaled_y,
                ci.hCursor,
                24,
                24,
                0,
                std::ptr::null_mut(),
                DI_NORMAL,
            );
        }
    }
}

/// Checks if a captured BGRA buffer from `PrintWindow` is completely black/empty
/// (a known DWM quirk with certain hardware-accelerated windows).
fn is_bgra_buffer_blank(bgra: &[u8]) -> bool {
    if bgra.len() < 64 {
        return true;
    }
    // Sample 64 evenly-spaced pixels across the frame
    let step = (bgra.len() / 4 / 64).max(1) * 4;
    let mut non_zero_samples = 0;
    let mut idx = 0;
    while idx + 3 < bgra.len() {
        let b = bgra[idx];
        let g = bgra[idx + 1];
        let r = bgra[idx + 2];
        if r > 4 || g > 4 || b > 4 {
            non_zero_samples += 1;
            if non_zero_samples >= 3 {
                return false;
            }
        }
        idx += step;
    }
    true
}

/// Captures a live frame from the specified monitor (`monitor_index`), downscaled using fast
/// hardware-friendly `COLORONCOLOR` GDI stretch (~3ms) and encoded to JPEG (Q=78).
pub fn capture_desktop_jpeg_base64(
    target_w: u32,
    target_h: u32,
    show_cursor: bool,
    monitor_index: usize,
) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    unsafe {
        let monitors = get_cached_monitors();
        let mon = monitors
            .get(monitor_index)
            .or_else(|| monitors.first())
            .cloned()
            .unwrap_or(MonitorInfo {
                index: 0,
                name: "Primary".into(),
                x: 0,
                y: 0,
                width: GetSystemMetrics(SM_CXSCREEN).max(640),
                height: GetSystemMetrics(SM_CYSCREEN).max(360),
                is_primary: true,
            });

        let out_w = (target_w.clamp(320, 1920)) as i32;
        let out_h = (target_h.clamp(180, 1080)) as i32;

        let hdc_screen = GetDC(std::ptr::null_mut());
        if hdc_screen.is_null() {
            return Err("Failed to acquire primary monitor DC".into());
        }

        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let hbm = CreateCompatibleBitmap(hdc_screen, out_w, out_h);
        if hdc_mem.is_null() || hbm.is_null() {
            if !hbm.is_null() {
                DeleteObject(hbm);
            }
            if !hdc_mem.is_null() {
                DeleteDC(hdc_mem);
            }
            ReleaseDC(std::ptr::null_mut(), hdc_screen);
            return Err("Failed to create compatible GDI bitmap".into());
        }

        let old_obj = SelectObject(hdc_mem, hbm);
        // COLORONCOLOR (STRETCH_DELETESCANS) is 8x faster than software HALFTONE
        SetStretchBltMode(hdc_mem, COLORONCOLOR as i32);
        let blt_ok = StretchBlt(
            hdc_mem,
            0,
            0,
            out_w,
            out_h,
            hdc_screen,
            mon.x,
            mon.y,
            mon.width,
            mon.height,
            SRCCOPY,
        );

        if blt_ok == 0 {
            let _ = BitBlt(
                hdc_mem,
                0,
                0,
                out_w,
                out_h,
                hdc_screen,
                mon.x,
                mon.y,
                SRCCOPY,
            );
        }

        if show_cursor {
            draw_cursor_on_hdc(
                hdc_mem,
                mon.x,
                mon.y,
                mon.width,
                mon.height,
                out_w,
                out_h,
            );
        }

        let mut bmi: BITMAPINFO = zeroed();
        bmi.bmiHeader.biSize = size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = out_w;
        bmi.bmiHeader.biHeight = -out_h; // Top-down DIB
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB;

        let mut bgra_buf: Vec<u8> = vec![0u8; (out_w as usize) * (out_h as usize) * 4];
        let lines = GetDIBits(
            hdc_mem,
            hbm,
            0,
            out_h as u32,
            bgra_buf.as_mut_ptr() as *mut _,
            &mut bmi,
            DIB_RGB_COLORS,
        );

        SelectObject(hdc_mem, old_obj);
        DeleteObject(hbm);
        DeleteDC(hdc_mem);
        ReleaseDC(std::ptr::null_mut(), hdc_screen);

        if lines == 0 {
            return Err("GetDIBits returned 0 scanlines".into());
        }

        encode_bgra_to_jpeg_data_url(&bgra_buf, out_w as u32, out_h as u32)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (target_w, target_h, show_cursor, monitor_index);
        Err("Unsupported OS".into())
    }
}

/// Captures a specific window (`HWND`) using OBS Studio `win-capture.dll` hybrid strategy:
/// 1. Validates `HWND`; if destroyed or invalid, re-matches by window title (`ms_find_window`).
/// 2. Tries `PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT)`.
/// 3. Verifies via `is_bgra_buffer_blank` that `PrintWindow` did not return a blank black DWM surface;
///    if blank, falls back automatically to screen `BitBlt` crop at the window's client rectangle.
pub fn capture_window_jpeg_base64(
    hwnd_val: isize,
    target_w: u32,
    target_h: u32,
    show_cursor: bool,
    fallback_title: Option<&str>,
) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    unsafe {
        let mut hwnd = hwnd_val as HWND;

        // Re-match window by title if the game/application recreated its HWND (OBS WindowMatchPriority::Title)
        if hwnd.is_null() || IsWindow(hwnd) == 0 || IsWindowVisible(hwnd) == 0 {
            if let Some(title_query) = fallback_title {
                let q = title_query.trim().to_lowercase();
                if !q.is_empty() {
                    if let Some(found) = enumerate_visible_windows()
                        .into_iter()
                        .find(|w| w.title.to_lowercase().contains(&q))
                    {
                        hwnd = found.hwnd as HWND;
                    }
                }
            }
        }

        if hwnd.is_null() || IsWindow(hwnd) == 0 || IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0
        {
            return capture_desktop_jpeg_base64(target_w, target_h, show_cursor, 0);
        }

        let mut win_rect: RECT = zeroed();
        if GetWindowRect(hwnd, &mut win_rect) == 0 {
            return capture_desktop_jpeg_base64(target_w, target_h, show_cursor, 0);
        }

        let mut client_rect: RECT = zeroed();
        let mut client_origin = POINT {
            x: win_rect.left,
            y: win_rect.top,
        };
        let has_client = GetClientRect(hwnd, &mut client_rect) != 0
            && ClientToScreen(hwnd, &mut client_origin) != 0
            && (client_rect.right - client_rect.left) >= 120
            && (client_rect.bottom - client_rect.top) >= 80;

        let win_w = (win_rect.right - win_rect.left).max(64);
        let win_h = (win_rect.bottom - win_rect.top).max(64);
        let out_w = (target_w.clamp(320, 1920)) as i32;
        let out_h = (target_h.clamp(180, 1080)) as i32;

        let hdc_screen = GetDC(std::ptr::null_mut());
        if hdc_screen.is_null() {
            return Err("Failed to acquire screen DC".into());
        }

        let hdc_win_mem = CreateCompatibleDC(hdc_screen);
        let hbm_win = CreateCompatibleBitmap(hdc_screen, win_w, win_h);
        let old_win = SelectObject(hdc_win_mem, hbm_win);

        let fast_set = WINDOW_FAST_BITBLT_SET.get_or_init(|| Mutex::new(HashSet::new()));
        let skip_print_window = fast_set
            .lock()
            .map(|s| s.contains(&(hwnd as isize)))
            .unwrap_or(false);

        let printed = if skip_print_window {
            0
        } else {
            PrintWindow(hwnd, hdc_win_mem, PW_RENDERFULLCONTENT)
        };

        let (mut src_x_in_mem, mut src_y_in_mem, mut src_crop_w, mut src_crop_h, mut screen_left, mut screen_top) =
            if printed != 0 {
                if has_client {
                    let offset_x = (client_origin.x - win_rect.left).max(0);
                    let offset_y = (client_origin.y - win_rect.top).max(0);
                    let cw = (client_rect.right - client_rect.left)
                        .min(win_w - offset_x)
                        .max(64);
                    let ch = (client_rect.bottom - client_rect.top)
                        .min(win_h - offset_y)
                        .max(64);
                    (offset_x, offset_y, cw, ch, client_origin.x, client_origin.y)
                } else {
                    (0, 0, win_w, win_h, win_rect.left, win_rect.top)
                }
            } else {
                let (sx, sy, sw, sh) = if has_client {
                    (
                        client_origin.x,
                        client_origin.y,
                        (client_rect.right - client_rect.left).max(64),
                        (client_rect.bottom - client_rect.top).max(64),
                    )
                } else {
                    (win_rect.left, win_rect.top, win_w, win_h)
                };
                let _ = BitBlt(hdc_win_mem, 0, 0, sw, sh, hdc_screen, sx, sy, SRCCOPY);
                (0, 0, sw, sh, sx, sy)
            };

        let hdc_scaled = CreateCompatibleDC(hdc_screen);
        let hbm_scaled = CreateCompatibleBitmap(hdc_screen, out_w, out_h);
        let old_scaled = SelectObject(hdc_scaled, hbm_scaled);
        SetStretchBltMode(hdc_scaled, COLORONCOLOR as i32);
        let _ = StretchBlt(
            hdc_scaled,
            0,
            0,
            out_w,
            out_h,
            hdc_win_mem,
            src_x_in_mem,
            src_y_in_mem,
            src_crop_w,
            src_crop_h,
            SRCCOPY,
        );

        let mut bmi: BITMAPINFO = zeroed();
        bmi.bmiHeader.biSize = size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = out_w;
        bmi.bmiHeader.biHeight = -out_h;
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB;

        let mut bgra_buf: Vec<u8> = vec![0u8; (out_w as usize) * (out_h as usize) * 4];
        let mut lines = GetDIBits(
            hdc_scaled,
            hbm_scaled,
            0,
            out_h as u32,
            bgra_buf.as_mut_ptr() as *mut _,
            &mut bmi,
            DIB_RGB_COLORS,
        );

        // OBS Fallback: if PrintWindow returned an all-black surface, cache this HWND for fast BitBlt crop
        if printed != 0 && (lines == 0 || is_bgra_buffer_blank(&bgra_buf)) {
            if let Ok(mut s) = fast_set.lock() {
                s.insert(hwnd as isize);
            }
            let (sx, sy, sw, sh) = if has_client {
                (
                    client_origin.x,
                    client_origin.y,
                    (client_rect.right - client_rect.left).max(64),
                    (client_rect.bottom - client_rect.top).max(64),
                )
            } else {
                (win_rect.left, win_rect.top, win_w, win_h)
            };
            src_x_in_mem = 0;
            src_y_in_mem = 0;
            src_crop_w = sw;
            src_crop_h = sh;
            screen_left = sx;
            screen_top = sy;
            let _ = BitBlt(hdc_win_mem, 0, 0, sw, sh, hdc_screen, sx, sy, SRCCOPY);
            let _ = StretchBlt(
                hdc_scaled,
                0,
                0,
                out_w,
                out_h,
                hdc_win_mem,
                src_x_in_mem,
                src_y_in_mem,
                src_crop_w,
                src_crop_h,
                SRCCOPY,
            );
        }

        if show_cursor {
            draw_cursor_on_hdc(
                hdc_scaled,
                screen_left,
                screen_top,
                src_crop_w,
                src_crop_h,
                out_w,
                out_h,
            );
        }

        lines = GetDIBits(
            hdc_scaled,
            hbm_scaled,
            0,
            out_h as u32,
            bgra_buf.as_mut_ptr() as *mut _,
            &mut bmi,
            DIB_RGB_COLORS,
        );

        SelectObject(hdc_scaled, old_scaled);
        DeleteObject(hbm_scaled);
        DeleteDC(hdc_scaled);

        SelectObject(hdc_win_mem, old_win);
        DeleteObject(hbm_win);
        DeleteDC(hdc_win_mem);
        ReleaseDC(std::ptr::null_mut(), hdc_screen);

        if lines == 0 {
            return capture_desktop_jpeg_base64(target_w, target_h, show_cursor, 0);
        }

        encode_bgra_to_jpeg_data_url(&bgra_buf, out_w as u32, out_h as u32)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (hwnd_val, target_w, target_h, show_cursor, fallback_title);
        Err("Unsupported OS".into())
    }
}

/// Converts a 4-channel Windows BGRA buffer into a 3-channel `RgbImage` and encodes to JPEG Base64 (Quality 78 for low latency).
fn encode_bgra_to_jpeg_data_url(bgra: &[u8], width: u32, height: u32) -> Result<String, String> {
    let mut rgb_bytes = Vec::with_capacity((width as usize) * (height as usize) * 3);
    for chunk in bgra.chunks_exact(4) {
        rgb_bytes.push(chunk[2]); // R
        rgb_bytes.push(chunk[1]); // G
        rgb_bytes.push(chunk[0]); // B
    }

    let rgb_img = RgbImage::from_raw(width, height, rgb_bytes)
        .ok_or_else(|| "Failed to construct 3-channel RgbImage from BGRA buffer".to_string())?;

    let mut jpeg_buf = Vec::with_capacity(49152);
    let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_buf, 78);
    encoder
        .encode_image(&rgb_img)
        .map_err(|e| format!("JPEG encoding error: {e}"))?;

    let encoded = BASE64.encode(jpeg_buf);
    Ok(format!("data:image/jpeg;base64,{encoded}"))
}

/// Saves a composed broadcast canvas PNG screenshot (`data:image/png;base64,...`) directly to disk.
pub fn save_canvas_screenshot_base64(
    screenshots_dir: &PathBuf,
    data_url: &str,
) -> Result<String, String> {
    std::fs::create_dir_all(screenshots_dir)
        .map_err(|e| format!("Cannot create screenshots folder: {e}"))?;

    let raw_b64 = data_url
        .strip_prefix("data:image/png;base64,")
        .or_else(|| data_url.split(',').nth(1))
        .unwrap_or(data_url);

    let bytes = BASE64
        .decode(raw_b64.trim())
        .map_err(|e| format!("Invalid PNG base64 payload: {e}"))?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let file_path = screenshots_dir.join(format!("Capture_{timestamp}.png"));
    std::fs::write(&file_path, bytes)
        .map_err(|e| format!("Failed to write PNG screenshot: {e}"))?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Saves a full-resolution PNG screenshot of the primary monitor to disk.
pub fn save_fullscreen_screenshot(screenshots_dir: &PathBuf) -> Result<String, String> {
    std::fs::create_dir_all(screenshots_dir)
        .map_err(|e| format!("Cannot create screenshots folder: {e}"))?;

    #[cfg(target_os = "windows")]
    unsafe {
        let w = GetSystemMetrics(SM_CXSCREEN).max(1280);
        let h = GetSystemMetrics(SM_CYSCREEN).max(720);

        let hdc_screen = GetDC(std::ptr::null_mut());
        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let hbm = CreateCompatibleBitmap(hdc_screen, w, h);
        let old = SelectObject(hdc_mem, hbm);

        let _ = BitBlt(hdc_mem, 0, 0, w, h, hdc_screen, 0, 0, SRCCOPY);
        draw_cursor_on_hdc(hdc_mem, 0, 0, w, h, w, h);

        let mut bmi: BITMAPINFO = zeroed();
        bmi.bmiHeader.biSize = size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = w;
        bmi.bmiHeader.biHeight = -h;
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB;

        let mut bgra: Vec<u8> = vec![0u8; (w as usize) * (h as usize) * 4];
        let lines = GetDIBits(
            hdc_mem,
            hbm,
            0,
            h as u32,
            bgra.as_mut_ptr() as *mut _,
            &mut bmi,
            DIB_RGB_COLORS,
        );

        SelectObject(hdc_mem, old);
        DeleteObject(hbm);
        DeleteDC(hdc_mem);
        ReleaseDC(std::ptr::null_mut(), hdc_screen);

        if lines == 0 {
            return Err("Failed to read screen pixels for screenshot".into());
        }

        let mut rgb_bytes = Vec::with_capacity((w as usize) * (h as usize) * 3);
        for chunk in bgra.chunks_exact(4) {
            rgb_bytes.push(chunk[2]);
            rgb_bytes.push(chunk[1]);
            rgb_bytes.push(chunk[0]);
        }

        let rgb_img = RgbImage::from_raw(w as u32, h as u32, rgb_bytes)
            .ok_or_else(|| "Failed to construct RgbImage for screenshot".to_string())?;

        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let file_path = screenshots_dir.join(format!("Capture_{timestamp}.png"));
        rgb_img
            .save_with_format(&file_path, ImageFormat::Png)
            .map_err(|e| format!("Failed to save PNG screenshot: {e}"))?;

        Ok(file_path.to_string_lossy().to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Unsupported OS".into())
    }
}

/// Lists all visible top-level windows for the Window/Game source picker and Auto Scene Switcher,
/// automatically excluding the current Gamecaster Plus process (`GetCurrentProcessId()`).
pub fn enumerate_visible_windows() -> Vec<WindowInfo> {
    #[cfg(target_os = "windows")]
    unsafe {
        struct EnumCtx {
            self_pid: u32,
            list: Vec<WindowInfo>,
        }

        unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let ctx = &mut *(lparam as *mut EnumCtx);
            if IsWindowVisible(hwnd) == 0 {
                return TRUE;
            }

            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == ctx.self_pid {
                return TRUE;
            }

            let len = GetWindowTextLengthW(hwnd);
            if len <= 0 {
                return TRUE;
            }
            let mut buf = vec![0u16; (len as usize) + 1];
            let copied = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
            if copied <= 0 {
                return TRUE;
            }
            let title = String::from_utf16_lossy(&buf[..copied as usize])
                .trim()
                .to_string();
            if title.is_empty()
                || title == "Program Manager"
                || title == "Windows Input Experience"
                || title == "Settings"
                || title.contains("Gamecaster Plus")
                || title.contains("MSCTFIME")
                || title.contains("Default IME")
            {
                return TRUE;
            }

            let mut rect: RECT = zeroed();
            let _ = GetWindowRect(hwnd, &mut rect);
            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;
            if width < 120 || height < 80 {
                return TRUE;
            }

            ctx.list.push(WindowInfo {
                hwnd: hwnd as isize,
                title,
                process_id: pid,
                width,
                height,
            });
            TRUE
        }

        let mut ctx = EnumCtx {
            self_pid: GetCurrentProcessId(),
            list: Vec::new(),
        };
        let _ = EnumWindows(Some(enum_proc), (&mut ctx as *mut EnumCtx) as LPARAM);
        ctx.list
    }

    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
}

/// Returns information about the current foreground window (`GetForegroundWindow`) for the Auto Scene Switcher.
pub fn get_foreground_window_info() -> Option<WindowInfo> {
    #[cfg(target_os = "windows")]
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == GetCurrentProcessId() {
            return None;
        }
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return None;
        }
        let mut buf = vec![0u16; (len as usize) + 1];
        let copied = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if copied <= 0 {
            return None;
        }
        let title = String::from_utf16_lossy(&buf[..copied as usize])
            .trim()
            .to_string();
        let mut rect: RECT = zeroed();
        let _ = GetWindowRect(hwnd, &mut rect);

        Some(WindowInfo {
            hwnd: hwnd as isize,
            title,
            process_id: pid,
            width: rect.right - rect.left,
            height: rect.bottom - rect.top,
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}
