use std::fs;

use tauri::App;

const BUNDLED_PET_REGISTRY: &str = include_str!("../../public/pets/pets.json");

#[derive(Debug, Clone)]
pub struct PetRegistryEntry {
    pub name: String,
    pub display_name: String,
}

#[derive(Debug, serde::Deserialize)]
struct PetListFile {
    #[serde(default)]
    pets: Vec<PetListEntry>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetListEntry {
    name: String,
    display_name: Option<String>,
}

pub fn load_pet_registry(app: &App) -> Vec<PetRegistryEntry> {
    read_pet_registry(app).unwrap_or_else(|error| {
        eprintln!("[koda-desk] failed to load pet registry, using fallback: {error}");
        fallback_pets()
    })
}

fn read_pet_registry(app: &App) -> Result<Vec<PetRegistryEntry>, String> {
    let content = read_pet_registry_content(app);
    let pet_list = serde_json::from_str::<PetListFile>(&content).map_err(|error| error.to_string())?;
    let pets = pet_list
        .pets
        .into_iter()
        .filter(|entry| !entry.name.is_empty())
        .map(|entry| PetRegistryEntry {
            display_name: entry.display_name.unwrap_or_else(|| entry.name.clone()),
            name: entry.name,
        })
        .collect::<Vec<_>>();

    if pets.is_empty() {
        return Err("pet registry does not contain any pets".to_string());
    }

    Ok(pets)
}

fn read_pet_registry_content(_app: &App) -> String {
    let source_path = std::env::current_dir()
        .ok()
        .map(|path| path.join("public").join("pets").join("pets.json"));

    if let Some(path) = source_path {
        if let Ok(content) = fs::read_to_string(path) {
            return content;
        }
    }

    BUNDLED_PET_REGISTRY.to_string()
}

fn fallback_pets() -> Vec<PetRegistryEntry> {
    vec![PetRegistryEntry {
        name: "koda".to_string(),
        display_name: "Koda".to_string(),
    }]
}
