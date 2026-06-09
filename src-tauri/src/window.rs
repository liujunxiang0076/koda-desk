use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize};

use crate::config::AppConfig;

const PET_WINDOW_WIDTH: f64 = 192.0;
const PET_WINDOW_HEIGHT: f64 = 208.0;
const SETTINGS_WINDOW_WIDTH: f64 = 340.0;
const SETTINGS_WINDOW_HEIGHT: f64 = 470.0;

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
    set_main_window_size(app, SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT)
}

fn main_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())
}

fn set_main_window_size(app: &AppHandle, width: f64, height: f64) -> Result<(), String> {
    main_window(app)?
        .set_size(LogicalSize::new(width, height))
        .map_err(|error| error.to_string())
}

fn emit_visibility(app: &AppHandle, visible: bool) {
    if let Err(error) = app.emit("pet:visibility", visible) {
        eprintln!("[koda-desk] failed to emit pet visibility: {error}");
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
