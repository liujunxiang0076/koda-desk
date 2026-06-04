use tauri::{AppHandle, Manager};

pub fn configure_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window.set_always_on_top(true) {
            eprintln!("[koda-desk] failed to set always on top: {error}");
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

fn main_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())
}
