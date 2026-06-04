use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

use crate::window;

pub fn create_tray(app: &tauri::App) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "显示/隐藏宠物", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &quit])?;

    let mut builder = TrayIconBuilder::new()
        .tooltip("Koda Desk")
        .menu(&menu)
        .menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => window::toggle_pet(app),
            "quit" => app.exit(0),
            id => eprintln!("[koda-desk] unhandled tray menu item: {id}"),
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}
