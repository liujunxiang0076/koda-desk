use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub pet: PetConfig,
    pub window: WindowConfig,
    pub behavior: BehaviorConfig,
    #[serde(default)]
    pub startup: StartupConfig,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PetConfig {
    pub current: String,
    pub scale: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowConfig {
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub always_on_top: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BehaviorConfig {
    pub mode: String,
    pub state: String,
    #[serde(default = "default_input_tracking_enabled")]
    pub input_tracking_enabled: bool,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupConfig {
    pub launch_on_boot: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            pet: PetConfig {
                current: "koda".to_string(),
                scale: "medium".to_string(),
            },
            window: WindowConfig {
                x: None,
                y: None,
                always_on_top: true,
            },
            behavior: BehaviorConfig {
                mode: "auto".to_string(),
                state: "idle".to_string(),
                input_tracking_enabled: true,
            },
            startup: StartupConfig {
                launch_on_boot: false,
            },
        }
    }
}

fn default_input_tracking_enabled() -> bool {
    true
}

pub fn load_config(app: &AppHandle) -> AppConfig {
    let path = config_path(app);

    match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<AppConfig>(&content) {
            Ok(config) => config,
            Err(error) => {
                eprintln!("[koda-desk] failed to parse config, using defaults: {error}");
                AppConfig::default()
            }
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => AppConfig::default(),
        Err(error) => {
            eprintln!("[koda-desk] failed to read config, using defaults: {error}");
            AppConfig::default()
        }
    }
}

pub fn save_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = config_path(app);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let content = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

pub fn update_config(
    app: &AppHandle,
    update: impl FnOnce(&mut AppConfig),
) -> Result<AppConfig, String> {
    let mut config = load_config(app);
    update(&mut config);
    save_config(app, &config)?;
    Ok(config)
}

fn config_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("config.json")
}
