use tauri::{
    menu::{Menu, MenuItem, Submenu},
    tray::TrayIconBuilder,
    Emitter,
};

use crate::window;

pub fn create_tray(app: &tauri::App) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "显示/隐藏宠物", true, None::<&str>)?;
    let koda = MenuItem::with_id(app, "pet:koda", "Koda", true, None::<&str>)?;
    let lumen = MenuItem::with_id(app, "pet:lumen", "Lumen", true, None::<&str>)?;
    let pet_menu = Submenu::with_items(app, "宠物", true, &[&koda, &lumen])?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &pet_menu, &quit])?;

    let mut builder = TrayIconBuilder::new()
        .tooltip("Koda Desk")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => window::toggle_pet(app),
            "pet:koda" => select_pet(app, "koda"),
            "pet:lumen" => select_pet(app, "lumen"),
            "quit" => app.exit(0),
            id => eprintln!("[koda-desk] unhandled tray menu item: {id}"),
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

fn select_pet(app: &tauri::AppHandle, pet: &'static str) {
    if let Err(error) = app.emit("pet:selected", pet) {
        eprintln!("[koda-desk] failed to emit pet selection: {error}");
    }

    if let Err(error) = window::show_pet(app) {
        eprintln!("[koda-desk] failed to show pet after selection: {error}");
    }
}
