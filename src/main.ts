import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createPetCanvas, type PetScale } from "./renderer/petCanvas";
import "./styles/app.css";

interface AppConfig {
  pet: {
    current: string;
    scale: PetScale;
  };
  behavior: {
    mode: string;
    state: string;
  };
}

const supportedPets = new Set(["koda", "lumen", "default"]);
const supportedScales = new Set<PetScale>(["small", "medium", "large"]);
const canvas = document.querySelector<HTMLCanvasElement>("#pet-canvas");
const menu = document.querySelector<HTMLDivElement>("#context-menu");
const currentWindow = getCurrentWindow();

if (!canvas || !menu) {
  throw new Error("Koda Desk root elements are missing.");
}

const petCanvas = canvas;
const contextMenu = menu;
const config = await loadConfig();
const initialPet = getInitialPetName(config);
const initialScale = getInitialPetScale(config);
const initialState = config.behavior.state || "idle";
const pet = createPetCanvas(petCanvas, `/pets/${initialPet}/pet.json`, initialScale, initialState);

pet.start().catch((error) => {
  console.error("[koda-desk] failed to start pet renderer", error);
});

listen<string>("pet:selected", (event) => {
  const petName = event.payload;

  if (!isSupportedPet(petName)) {
    console.error(`[koda-desk] unsupported pet selected: ${petName}`);
    return;
  }

  localStorage.setItem("koda-desk.currentPet", petName);
  invoke("set_current_pet", { pet: petName }).catch((error) => {
    console.error(`[koda-desk] failed to save current pet ${petName}`, error);
  });
  pet.switchPet(`/pets/${petName}/pet.json`).catch((error) => {
    console.error(`[koda-desk] failed to switch pet to ${petName}`, error);
  });
}).catch((error) => {
  console.error("[koda-desk] failed to subscribe pet selection event", error);
});

listen<string>("pet:scale", (event) => {
  const scale = event.payload;

  if (!isSupportedScale(scale)) {
    console.error(`[koda-desk] unsupported pet scale: ${scale}`);
    return;
  }

  pet.setScale(scale);
  invoke("set_pet_scale", { scale }).catch((error) => {
    console.error(`[koda-desk] failed to save pet scale ${scale}`, error);
  });
}).catch((error) => {
  console.error("[koda-desk] failed to subscribe pet scale event", error);
});

listen<string>("pet:state", (event) => {
  const state = event.payload;
  pet.setState(state === "auto" ? "idle" : state);
  invoke("set_behavior_state", { mode: "manual", state }).catch((error) => {
    console.error(`[koda-desk] failed to save pet state ${state}`, error);
  });
}).catch((error) => {
  console.error("[koda-desk] failed to subscribe pet state event", error);
});

listen("settings:open", () => {
  invoke("open_settings").catch((error) => {
    console.error("[koda-desk] failed to open settings", error);
  });
}).catch((error) => {
  console.error("[koda-desk] failed to subscribe settings event", error);
});

petCanvas.addEventListener("mousedown", async (event) => {
  if (event.button !== 0) {
    return;
  }

  hideContextMenu();

  try {
    await currentWindow.startDragging();
    await saveWindowPosition();
  } catch (error) {
    console.error("[koda-desk] failed to start window dragging", error);
  }
});

petCanvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  showContextMenu(event.clientX, event.clientY);
});

document.addEventListener("click", (event) => {
  if (!contextMenu.contains(event.target as Node)) {
    hideContextMenu();
  }
});

contextMenu.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const action = target.dataset.action;

  if (!action) {
    return;
  }

  hideContextMenu();

  try {
    await invoke(action === "quit" ? "quit_app" : `${action}_pet`);
  } catch (error) {
    console.error(`[koda-desk] failed to run ${action}`, error);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pet.stop();
  } else {
    pet.start().catch((error) => {
      console.error("[koda-desk] failed to resume pet renderer", error);
    });
  }
});

async function loadConfig(): Promise<AppConfig> {
  try {
    return await invoke<AppConfig>("get_config");
  } catch (error) {
    console.error("[koda-desk] failed to load config, using defaults", error);
    return {
      pet: { current: "koda", scale: "medium" },
      behavior: { mode: "auto", state: "idle" },
    };
  }
}

async function saveWindowPosition(): Promise<void> {
  const position = await currentWindow.outerPosition();
  await invoke("save_window_position", { x: position.x, y: position.y });
}

function showContextMenu(x: number, y: number): void {
  contextMenu.hidden = false;
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
}

function hideContextMenu(): void {
  contextMenu.hidden = true;
}

function getInitialPetName(config: AppConfig): string {
  const urlPet = new URLSearchParams(window.location.search).get("pet");

  if (urlPet && isSupportedPet(urlPet)) {
    localStorage.setItem("koda-desk.currentPet", urlPet);
    return urlPet;
  }

  const savedPet = localStorage.getItem("koda-desk.currentPet");
  if (savedPet && isSupportedPet(savedPet)) {
    return savedPet;
  }

  if (isSupportedPet(config.pet.current)) {
    return config.pet.current;
  }

  return "koda";
}

function getInitialPetScale(config: AppConfig): PetScale {
  return isSupportedScale(config.pet.scale) ? config.pet.scale : "medium";
}

function isSupportedPet(value: string): boolean {
  return supportedPets.has(value);
}

function isSupportedScale(value: string): value is PetScale {
  return supportedScales.has(value as PetScale);
}
