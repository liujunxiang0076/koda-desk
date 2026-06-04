#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod pet_registry;
mod tray;
mod window;

use config::AppConfig;

#[tauri::command]
fn get_config(app: tauri::AppHandle) -> AppConfig {
    config::load_config(&app)
}

#[tauri::command]
fn set_current_pet(app: tauri::AppHandle, pet: String) -> Result<AppConfig, String> {
    config::update_config(&app, |config| {
        config.pet.current = pet;
    })
}

#[tauri::command]
fn set_pet_scale(app: tauri::AppHandle, scale: String) -> Result<AppConfig, String> {
    config::update_config(&app, |config| {
        config.pet.scale = scale;
    })
}

#[tauri::command]
fn set_behavior_state(app: tauri::AppHandle, mode: String, state: String) -> Result<AppConfig, String> {
    config::update_config(&app, |config| {
        config.behavior.mode = mode;
        config.behavior.state = state;
    })
}

#[tauri::command]
fn save_window_position(app: tauri::AppHandle, x: i32, y: i32) -> Result<AppConfig, String> {
    config::update_config(&app, |config| {
        config.window.x = Some(x);
        config.window.y = Some(y);
    })
}

#[tauri::command]
fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    window::resize_for_settings(&app)
}

#[tauri::command]
fn close_settings(app: tauri::AppHandle) -> Result<(), String> {
    window::resize_for_pet(&app)
}

#[tauri::command]
fn show_pet(app: tauri::AppHandle) -> Result<(), String> {
    window::show_pet(&app)
}

#[tauri::command]
fn hide_pet(app: tauri::AppHandle) -> Result<(), String> {
    window::hide_pet(&app)
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_current_pet,
            set_pet_scale,
            set_behavior_state,
            save_window_position,
            open_settings,
            close_settings,
            show_pet,
            hide_pet,
            quit_app
        ])
        .setup(|app| {
            let config = config::load_config(app.handle());
            window::configure_main_window(app.handle(), &config);
            tray::create_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Koda Desk");
}
