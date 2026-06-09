use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize};

use crate::config::AppConfig;

const PET_WINDOW_WIDTH: f64 = 192.0;
const PET_WINDOW_HEIGHT: f64 = 208.0;
const SETTINGS_WINDOW_WIDTH: f64 = 340.0;
const SETTINGS_WINDOW_HEIGHT: f64 = 510.0;

pub fn configure_main_window(app: &AppHandle, config: &AppConfig) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window.set_always_on_top(config.window.always_on_top) {
            eprintln!("[koda-desk] failed to set always on top: {error}");
        }

        if let (Some(x), Some(y)) = (config.window.x, config.window.y) {
            let position = safe_window_position(&window, x, y);
            if let Err(error) = window.set_position(position) {
                eprintln!("[koda-desk] failed to restore window position: {error}");
            }
        }
    }
}

pub fn show_pet(app: &AppHandle) -> Result<(), String> {
    let window = main_window(app)?;
    window.show().map_err(|error| error.to_string())?;
    emit_visibility(app, true);
    Ok(())
}

pub fn hide_pet(app: &AppHandle) -> Result<(), String> {
    let window = main_window(app)?;
    window.hide().map_err(|error| error.to_string())?;
    emit_visibility(app, false);
    Ok(())
}

pub fn toggle_pet(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("[koda-desk] main window not found");
        return;
    };

    match window.is_visible() {
        Ok(true) => {
            if let Err(error) = hide_pet(app) {
                eprintln!("[koda-desk] failed to hide pet: {error}");
            }
        }
        Ok(false) => {
            if let Err(error) = show_pet(app) {
                eprintln!("[koda-desk] failed to show pet: {error}");
            }
        }
        Err(error) => eprintln!("[koda-desk] failed to read window visibility: {error}"),
    }
}

pub fn resize_for_settings(app: &AppHandle) -> Result<(), String> {
    let window = main_window(app)?;
    window
        .set_size(LogicalSize::new(
            SETTINGS_WINDOW_WIDTH,
            SETTINGS_WINDOW_HEIGHT,
        ))
        .map_err(|error| error.to_string())?;
    keep_settings_window_visible(&window)
}

fn main_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())
}

fn emit_visibility(app: &AppHandle, visible: bool) {
    if let Err(error) = app.emit("pet:visibility", visible) {
        eprintln!("[koda-desk] failed to emit pet visibility: {error}");
    }
}

fn keep_settings_window_visible(window: &tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    {
        return keep_settings_window_visible_windows(window);
    }

    #[cfg(not(windows))]
    {
        keep_settings_window_visible_logical(window)
    }
}

#[cfg(not(windows))]
fn keep_settings_window_visible_logical(window: &tauri::WebviewWindow) -> Result<(), String> {
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let position = window
        .outer_position()
        .map_err(|error| error.to_string())?
        .to_logical::<f64>(scale_factor);
    let monitors = window.available_monitors().unwrap_or_default();
    let monitor = monitors
        .iter()
        .find(|monitor| {
            let origin = monitor.position().to_logical::<f64>(scale_factor);
            let size = monitor.size().to_logical::<f64>(scale_factor);
            position.x >= origin.x
                && position.x < origin.x + size.width
                && position.y >= origin.y
                && position.y < origin.y + size.height
        })
        .or_else(|| monitors.first());

    let Some(monitor) = monitor else {
        return Ok(());
    };

    let origin = monitor.position().to_logical::<f64>(scale_factor);
    let size = monitor.size().to_logical::<f64>(scale_factor);
    let max_x = (origin.x + size.width - SETTINGS_WINDOW_WIDTH).max(origin.x);
    let max_y = (origin.y + size.height - SETTINGS_WINDOW_HEIGHT).max(origin.y);
    let safe_position = tauri::LogicalPosition::new(
        position.x.clamp(origin.x, max_x),
        position.y.clamp(origin.y, max_y),
    );

    window
        .set_position(safe_position)
        .map_err(|error| error.to_string())
}

#[cfg(windows)]
fn keep_settings_window_visible_windows(window: &tauri::WebviewWindow) -> Result<(), String> {
    use std::mem::size_of;
    use windows_sys::Win32::Foundation::{HWND, RECT};
    use windows_sys::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows_sys::Win32::UI::HiDpi::GetDpiForWindow;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowRect, SetWindowPos, SWP_NOSIZE, SWP_NOZORDER,
    };

    let hwnd = window.hwnd().map_err(|error| error.to_string())?.0 as HWND;

    unsafe {
        let mut window_rect = RECT::default();
        if GetWindowRect(hwnd, &mut window_rect) == 0 {
            return Err("failed to read settings window bounds".to_string());
        }

        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        if monitor.is_null() {
            return Ok(());
        }

        let mut monitor_info = MONITORINFO {
            cbSize: size_of::<MONITORINFO>() as u32,
            rcMonitor: RECT::default(),
            rcWork: RECT::default(),
            dwFlags: 0,
        };

        if GetMonitorInfoW(monitor, &mut monitor_info) == 0 {
            return Ok(());
        }

        let dpi = GetDpiForWindow(hwnd);
        let scale_factor = if dpi == 0 { 1.0 } else { dpi as f64 / 96.0 };
        let work_area = scale_rect(monitor_info.rcWork, scale_factor);
        let width = window_rect.right - window_rect.left;
        let height = window_rect.bottom - window_rect.top;
        let left = (window_rect.left.min(work_area.right - width)).max(work_area.left);
        let top = (window_rect.top.min(work_area.bottom - height)).max(work_area.top);

        if left != window_rect.left || top != window_rect.top {
            let moved = SetWindowPos(
                hwnd,
                std::ptr::null_mut(),
                left,
                top,
                0,
                0,
                SWP_NOSIZE | SWP_NOZORDER,
            );

            if moved == 0 {
                return Err("failed to keep settings window on screen".to_string());
            }
        }
    }

    Ok(())
}

#[cfg(windows)]
fn scale_rect(
    rect: windows_sys::Win32::Foundation::RECT,
    scale_factor: f64,
) -> windows_sys::Win32::Foundation::RECT {
    if scale_factor <= 0.0 || (scale_factor - 1.0).abs() < f64::EPSILON {
        return rect;
    }

    windows_sys::Win32::Foundation::RECT {
        left: (rect.left as f64 / scale_factor).round() as i32,
        top: (rect.top as f64 / scale_factor).round() as i32,
        right: (rect.right as f64 / scale_factor).round() as i32,
        bottom: (rect.bottom as f64 / scale_factor).round() as i32,
    }
}

fn safe_window_position(window: &tauri::WebviewWindow, x: i32, y: i32) -> PhysicalPosition<i32> {
    let monitors = window.available_monitors().unwrap_or_default();
    let monitor = monitors
        .iter()
        .find(|monitor| {
            let origin = monitor.position();
            let size = monitor.size();
            x >= origin.x
                && x < origin.x + size.width as i32
                && y >= origin.y
                && y < origin.y + size.height as i32
        })
        .or_else(|| monitors.first());

    let Some(monitor) = monitor else {
        return PhysicalPosition::new(x, y);
    };

    let origin = monitor.position();
    let size = monitor.size();
    let window_size = window
        .outer_size()
        .unwrap_or_else(|_| PhysicalSize::new(PET_WINDOW_WIDTH as u32, PET_WINDOW_HEIGHT as u32));
    let max_x = (origin.x + size.width as i32 - window_size.width as i32).max(origin.x);
    let max_y = (origin.y + size.height as i32 - window_size.height as i32).max(origin.y);

    PhysicalPosition::new(x.clamp(origin.x, max_x), y.clamp(origin.y, max_y))
}
