use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::{ImageFormat, RgbImage};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::mem::{size_of, zeroed};
use std::path::PathBuf;

#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    Foundation::{BOOL, HWND, LPARAM, POINT, RECT, TRUE},
    Graphics::Gdi::{
        BitBlt, ClientToScreen, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
        GetDC, GetDIBits, ReleaseDC, SelectObject, SetStretchBltMode, StretchBlt, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HALFTONE, HDC, SRCCOPY,
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
/// from desktop/screen capture via Win32 `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)`.
/// This eliminates the "infinite mirror effect" when capturing the primary monitor.
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
pub struct WindowInfo {
    pub hwnd: isize,
    pub title: String,
    pub process_id: u32,
    pub width: i32,
    pub height: i32,
}

/// Draws the live hardware mouse cursor onto `hdc_target` scaled to the capture bounds
/// (replicating OBS `win-capture.dll` cursor overlay and XSplit `IsCursorCaptureEnabled`).
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

/// Captures a live frame from the primary desktop monitor, downscaled to `target_w x target_h`
/// for smooth 60 FPS Stage composition, converting 4-channel BGRA explicitly to 3-channel RGB
/// before encoding to JPEG Base64.
pub fn capture_desktop_jpeg_base64(
    target_w: u32,
    target_h: u32,
    show_cursor: bool,
) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    unsafe {
        let screen_w = GetSystemMetrics(SM_CXSCREEN).max(640);
        let screen_h = GetSystemMetrics(SM_CYSCREEN).max(360);
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
        SetStretchBltMode(hdc_mem, HALFTONE as i32);
        let blt_ok = StretchBlt(
            hdc_mem,
            0,
            0,
            out_w,
            out_h,
            hdc_screen,
            0,
            0,
            screen_w,
            screen_h,
            SRCCOPY,
        );

        if blt_ok == 0 {
            let _ = BitBlt(hdc_mem, 0, 0, out_w, out_h, hdc_screen, 0, 0, SRCCOPY);
        }

        if show_cursor {
            draw_cursor_on_hdc(hdc_mem, 0, 0, screen_w, screen_h, out_w, out_h);
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
        let _ = (target_w, target_h, show_cursor);
        Err("Unsupported OS".into())
    }
}

/// Captures a specific window (`HWND`) using OBS Studio `win-capture.dll` hybrid strategy:
/// 1. Validates `HWND`; if destroyed or invalid, attempts re-matching by window title (`ms_find_window`).
/// 2. Uses `PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT)` for background/occluded hardware windows,
///    falling back to `BitBlt` client-area crop (`GetClientRect` + `ClientToScreen`) when needed.
/// 3. Overlays the mouse cursor (`DrawIconEx`) when `show_cursor` is enabled.
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

        if hwnd.is_null() || IsWindow(hwnd) == 0 || IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
            return capture_desktop_jpeg_base64(target_w, target_h, show_cursor);
        }

        let mut win_rect: RECT = zeroed();
        if GetWindowRect(hwnd, &mut win_rect) == 0 {
            return capture_desktop_jpeg_base64(target_w, target_h, show_cursor);
        }

        // Compute Client Area rect (excludes Windows titlebar/shadow borders when possible)
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

        // Try hardware-accelerated window render first, fallback to screen client-area BitBlt
        let printed = PrintWindow(hwnd, hdc_win_mem, PW_RENDERFULLCONTENT);
        let (src_x_in_mem, src_y_in_mem, src_crop_w, src_crop_h, screen_left, screen_top) =
            if printed != 0 {
                if has_client {
                    let offset_x = (client_origin.x - win_rect.left).max(0);
                    let offset_y = (client_origin.y - win_rect.top).max(0);
                    let cw = (client_rect.right - client_rect.left).min(win_w - offset_x).max(64);
                    let ch = (client_rect.bottom - client_rect.top).min(win_h - offset_y).max(64);
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
        SetStretchBltMode(hdc_scaled, HALFTONE as i32);
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

        let mut bmi: BITMAPINFO = zeroed();
        bmi.bmiHeader.biSize = size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = out_w;
        bmi.bmiHeader.biHeight = -out_h;
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB;

        let mut bgra_buf: Vec<u8> = vec![0u8; (out_w as usize) * (out_h as usize) * 4];
        let lines = GetDIBits(
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
            return capture_desktop_jpeg_base64(target_w, target_h, show_cursor);
        }

        encode_bgra_to_jpeg_data_url(&bgra_buf, out_w as u32, out_h as u32)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (hwnd_val, target_w, target_h, show_cursor, fallback_title);
        Err("Unsupported OS".into())
    }
}

/// Converts a 4-channel Windows BGRA buffer into a 3-channel `RgbImage` and encodes to JPEG Base64.
fn encode_bgra_to_jpeg_data_url(bgra: &[u8], width: u32, height: u32) -> Result<String, String> {
    let mut rgb_bytes = Vec::with_capacity((width as usize) * (height as usize) * 3);
    for chunk in bgra.chunks_exact(4) {
        rgb_bytes.push(chunk[2]); // R
        rgb_bytes.push(chunk[1]); // G
        rgb_bytes.push(chunk[0]); // B
    }

    let rgb_img = RgbImage::from_raw(width, height, rgb_bytes)
        .ok_or_else(|| "Failed to construct 3-channel RgbImage from BGRA buffer".to_string())?;

    let mut jpeg_cursor = Cursor::new(Vec::with_capacity(65536));
    rgb_img
        .write_to(&mut jpeg_cursor, ImageFormat::Jpeg)
        .map_err(|e| format!("JPEG encoding error: {e}"))?;

    let encoded = BASE64.encode(jpeg_cursor.into_inner());
    Ok(format!("data:image/jpeg;base64,{encoded}"))
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
