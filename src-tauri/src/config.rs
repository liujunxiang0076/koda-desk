use tauri::AppHandle;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub pet: PetConfig,
    pub window: WindowConfig,
    pub behavior: BehaviorConfig,
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
pub struct BehaviorConfig {
    pub mode: String,
    pub state: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
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
            },
            startup: StartupConfig {
                launch_on_boot: false,
            },
        }
    }
}

pub fn load_default_config(_app: &AppHandle) -> AppConfig {
    AppConfig::default()
}
