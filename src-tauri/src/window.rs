use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager};

use crate::config::AppConfig;

const PET_WINDOW_WIDTH: f64 = 192.0;
const PET_WINDOW_HEIGHT: f64 = 208.0;
const SETTINGS_WINDOW_WIDTH: f64 = 340.0;
const SETTINGS_WINDOW_HEIGHT: f64 = 420.0;

pub fn configure_main_window(app: &AppHandle, config: &AppConfig) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window.set_always_on_top(config.window.always_on_top) {
            eprintln!("[koda-desk] failed to set always on top: {error}");
        }

        if let (Some(x), Some(y)) = (config.window.x, config.window.y) {
            if let Err(error) = window.set_position(LogicalPosition::new(x as f64, y as f64)) {
                eprintln!("[koda-desk] failed to restore window position: {error}");
            }
        }
    }
}

pub fn show_pet(app: &AppHandle) -> Result<(), String> {
    let window = main_window(app)?;
    window.show().map_err(|error| error.to_string())
}

pub fn hide_pet(app: &AppHandle) -> Result<(), String> {
    let window = main_window(app)?;
    window.hide().map_err(|error| error.to_string())
}

pub fn toggle_pet(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("[koda-desk] main window not found");
        return;
    };

    match window.is_visible() {
        Ok(true) => {
            if let Err(error) = window.hide() {
                eprintln!("[koda-desk] failed to hide pet: {error}");
            }
        }
        Ok(false) => {
            if let Err(error) = window.show() {
                eprintln!("[koda-desk] failed to show pet: {error}");
            }
        }
        Err(error) => eprintln!("[koda-desk] failed to read window visibility: {error}"),
    }
}

pub fn resize_for_pet(app: &AppHandle) -> Result<(), String> {
    set_main_window_size(app, PET_WINDOW_WIDTH, PET_WINDOW_HEIGHT)
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
