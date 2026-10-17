use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::{ImageFormat, RgbImage};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::mem::{size_of, zeroed};
use std::path::PathBuf;

#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    Foundation::{BOOL, HWND, LPARAM, RECT, TRUE},
    Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, SetStretchBltMode, StretchBlt, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HALFTONE, SRCCOPY,
    },
    Storage::Xps::PrintWindow,
    System::Threading::GetCurrentProcessId,
    UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetSystemMetrics, GetWindowRect, GetWindowTextLengthW,
        GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
        SetWindowDisplayAffinity, PW_RENDERFULLCONTENT, SM_CXSCREEN, SM_CYSCREEN,
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

/// Captures a live frame from the primary desktop monitor, downscaled to `target_w x target_h`
/// for smooth 60 FPS Stage composition, converting 4-channel BGRA explicitly to 3-channel RGB
/// before encoding to JPEG Base64.
pub fn capture_desktop_jpeg_base64(target_w: u32, target_h: u32) -> Result<String, String> {
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
        let _ = (target_w, target_h);
        Err("Unsupported OS".into())
    }
}

/// Captures a specific window (HWND) by using PrintWindow(PW_RENDERFULLCONTENT) with automatic
/// fallback to desktop crop at the window's screen rectangle, converting BGRA -> RGB -> JPEG Base64.
pub fn capture_window_jpeg_base64(hwnd_val: isize, target_w: u32, target_h: u32) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    unsafe {
        let hwnd = hwnd_val as HWND;
        if hwnd.is_null() || IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
            return capture_desktop_jpeg_base64(target_w, target_h);
        }

        let mut rect: RECT = zeroed();
        if GetWindowRect(hwnd, &mut rect) == 0 {
            return capture_desktop_jpeg_base64(target_w, target_h);
        }

        let win_w = (rect.right - rect.left).max(64);
        let win_h = (rect.bottom - rect.top).max(64);
        let out_w = (target_w.clamp(320, 1920)) as i32;
        let out_h = (target_h.clamp(180, 1080)) as i32;

        let hdc_screen = GetDC(std::ptr::null_mut());
        if hdc_screen.is_null() {
            return Err("Failed to acquire screen DC".into());
        }

        let hdc_win_mem = CreateCompatibleDC(hdc_screen);
        let hbm_win = CreateCompatibleBitmap(hdc_screen, win_w, win_h);
        let old_win = SelectObject(hdc_win_mem, hbm_win);

        // Try hardware-accelerated window render first, fallback to screen BitBlt
        let printed = PrintWindow(hwnd, hdc_win_mem, PW_RENDERFULLCONTENT);
        if printed == 0 {
            let _ = BitBlt(
                hdc_win_mem,
                0,
                0,
                win_w,
                win_h,
                hdc_screen,
                rect.left,
                rect.top,
                SRCCOPY,
            );
        }

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
            0,
            0,
            win_w,
            win_h,
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
            return capture_desktop_jpeg_base64(target_w, target_h);
        }

        encode_bgra_to_jpeg_data_url(&bgra_buf, out_w as u32, out_h as u32)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (hwnd_val, target_w, target_h);
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

/// Lists all visible top-level windows for the Window/Game source picker and Auto Scene Switcher.
pub fn enumerate_visible_windows() -> Vec<WindowInfo> {
    #[cfg(target_os = "windows")]
    unsafe {
        unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let list = &mut *(lparam as *mut Vec<WindowInfo>);
            if IsWindowVisible(hwnd) == 0 {
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

            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);

            list.push(WindowInfo {
                hwnd: hwnd as isize,
                title,
                process_id: pid,
                width,
                height,
            });
            TRUE
        }

        let mut windows: Vec<WindowInfo> = Vec::new();
        let _ = EnumWindows(Some(enum_proc), (&mut windows as *mut Vec<WindowInfo>) as LPARAM);
        windows
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
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);

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
