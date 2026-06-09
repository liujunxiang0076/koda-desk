use tauri::{
    menu::{IsMenuItem, Menu, MenuItem, Submenu},
    tray::TrayIconBuilder,
    Emitter,
};

use crate::pet_registry;
use crate::window;

pub fn create_tray(app: &tauri::App) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "显示/隐藏宠物", true, None::<&str>)?;
    let pet_items = pet_registry::load_pet_registry(app)
        .into_iter()
        .map(|pet| {
            MenuItem::with_id(
                app,
                format!("pet:{}", pet.name),
                pet.display_name,
                true,
                None::<&str>,
            )
        })
        .collect::<tauri::Result<Vec<_>>>()?;
    let pet_menu_items = pet_items
        .iter()
        .map(|item| item as &dyn IsMenuItem<tauri::Wry>)
        .collect::<Vec<_>>();
    let pet_menu = Submenu::with_items(app, "切换宠物", true, &pet_menu_items)?;
    let scale_small = MenuItem::with_id(app, "scale:small", "小", true, None::<&str>)?;
    let scale_medium = MenuItem::with_id(app, "scale:medium", "中", true, None::<&str>)?;
    let scale_large = MenuItem::with_id(app, "scale:large", "大", true, None::<&str>)?;
    let scale_menu = Submenu::with_items(
        app,
        "缩放",
        true,
        &[&scale_small, &scale_medium, &scale_large],
    )?;
    let state_auto = MenuItem::with_id(app, "state:auto", "自动", true, None::<&str>)?;
    let state_idle = MenuItem::with_id(app, "state:idle", "摸鱼", true, None::<&str>)?;
    let state_working = MenuItem::with_id(app, "state:working", "工作", true, None::<&str>)?;
    let state_typing = MenuItem::with_id(app, "state:typing", "敲键盘", true, None::<&str>)?;
    let state_mousing = MenuItem::with_id(app, "state:mousing", "滑鼠标", true, None::<&str>)?;
    let state_waiting = MenuItem::with_id(app, "state:waiting", "等待", true, None::<&str>)?;
    let state_failed = MenuItem::with_id(app, "state:failed", "故障", true, None::<&str>)?;
    let state_review = MenuItem::with_id(app, "state:review", "检查", true, None::<&str>)?;
    let state_menu = Submenu::with_items(
        app,
        "状态",
        true,
        &[
            &state_auto,
            &state_idle,
            &state_working,
            &state_typing,
            &state_mousing,
            &state_waiting,
            &state_failed,
            &state_review,
        ],
    )?;
    let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &toggle,
            &pet_menu,
            &scale_menu,
            &state_menu,
            &settings,
            &quit,
        ],
    )?;

    let mut builder = TrayIconBuilder::new()
        .tooltip("Koda Desk")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => window::toggle_pet(app),
            "scale:small" => emit_selection(app, "pet:scale", "small"),
            "scale:medium" => emit_selection(app, "pet:scale", "medium"),
            "scale:large" => emit_selection(app, "pet:scale", "large"),
            "state:auto" => emit_selection(app, "pet:state", "auto"),
            "state:idle" => emit_selection(app, "pet:state", "idle"),
            "state:working" => emit_selection(app, "pet:state", "working"),
            "state:typing" => emit_selection(app, "pet:state", "typing"),
            "state:mousing" => emit_selection(app, "pet:state", "mousing"),
            "state:waiting" => emit_selection(app, "pet:state", "waiting"),
            "state:failed" => emit_selection(app, "pet:state", "failed"),
            "state:review" => emit_selection(app, "pet:state", "review"),
            "settings" => open_settings(app),
            "quit" => app.exit(0),
            id if id.starts_with("pet:") => select_pet(app, id.trim_start_matches("pet:")),
            id => eprintln!("[koda-desk] unhandled tray menu item: {id}"),
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

fn open_settings(app: &tauri::AppHandle) {
    if let Err(error) = window::show_pet(app) {
        eprintln!("[koda-desk] failed to show pet before opening settings: {error}");
    }

    emit_selection(app, "settings:open", "tray");
}

fn select_pet(app: &tauri::AppHandle, pet: &str) {
    emit_selection(app, "pet:selected", pet);

    if let Err(error) = window::show_pet(app) {
        eprintln!("[koda-desk] failed to show pet after selection: {error}");
    }
}

fn emit_selection(app: &tauri::AppHandle, event: &str, value: &str) {
    if let Err(error) = app.emit(event, value.to_string()) {
        eprintln!("[koda-desk] failed to emit {event}: {error}");
    }
}
