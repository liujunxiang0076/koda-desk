#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod tray;
mod window;

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
        .invoke_handler(tauri::generate_handler![show_pet, hide_pet, quit_app])
        .setup(|app| {
            config::load_default_config(app.handle());
            window::configure_main_window(app.handle());
            tray::create_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Koda Desk");
}
