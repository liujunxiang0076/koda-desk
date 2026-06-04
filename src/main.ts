import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { createPetCanvas, type PetDisplaySize, type PetScale } from "./renderer/petCanvas";
import { loadPetRegistry, type PetRegistry, type PetRegistryEntry } from "./renderer/petRegistry";
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

const supportedScales = new Set<PetScale>(["small", "medium", "large"]);
const canvas = queryRequired<HTMLCanvasElement>("#pet-canvas");
const menu = queryRequired<HTMLDivElement>("#context-menu");
const settingsPanel = queryRequired<HTMLElement>("#settings-panel");
const settingsPet = queryRequired<HTMLSelectElement>("#settings-pet");
const settingsScale = queryRequired<HTMLSelectElement>("#settings-scale");
const settingsMode = queryRequired<HTMLSelectElement>("#settings-mode");
const settingsState = queryRequired<HTMLSelectElement>("#settings-state");
const currentWindow = getCurrentWindow();

const petCanvas = canvas;
const contextMenu = menu;
const petRegistry = await loadPetRegistry();
const config = await loadConfig();
const initialPet = getInitialPet(config, petRegistry);
const initialScale = getInitialPetScale(config);
const initialState = config.behavior.mode === "auto" ? inferAutomaticState() : config.behavior.state || "idle";
const pet = createPetCanvas(petCanvas, initialPet.manifest, initialScale, initialState);

hydrateSettings(config, initialPet.name, initialScale, initialState, petRegistry);
pet.start().then(() => fitPetWindow()).catch((error) => {
  console.error("[koda-desk] failed to start pet renderer", error);
});

listen<string>("pet:selected", (event) => {
  const petName = event.payload;

  if (!petRegistry.has(petName)) {
    console.error(`[koda-desk] unsupported pet selected: ${petName}`);
    return;
  }

  selectPet(petName);
}).catch((error) => {
  console.error("[koda-desk] failed to subscribe pet selection event", error);
});

listen<string>("pet:scale", (event) => {
  const scale = event.payload;

  if (!isSupportedScale(scale)) {
    console.error(`[koda-desk] unsupported pet scale: ${scale}`);
    return;
  }

  selectScale(scale);
}).catch((error) => {
  console.error("[koda-desk] failed to subscribe pet scale event", error);
});

listen<string>("pet:state", (event) => {
  selectState(event.payload, "manual");
}).catch((error) => {
  console.error("[koda-desk] failed to subscribe pet state event", error);
});

listen("settings:open", () => {
  openSettings();
}).catch((error) => {
  console.error("[koda-desk] failed to subscribe settings event", error);
});

petCanvas.addEventListener("mousedown", async (event) => {
  if (event.button !== 0 || !settingsPanel.hidden) {
    return;
  }

  hideContextMenu();
  const previousState = settingsMode.value === "auto" ? inferAutomaticState() : settingsState.value;
  pet.setState("dragging");

  try {
    await currentWindow.startDragging();
    await saveWindowPosition();
  } catch (error) {
    console.error("[koda-desk] failed to start window dragging", error);
  } finally {
    pet.setState(previousState);
  }
});

petCanvas.addEventListener("click", () => {
  if (!settingsPanel.hidden) {
    return;
  }

  const previousState = settingsMode.value === "auto" ? inferAutomaticState() : settingsState.value;
  pet.setState("review");
  window.setTimeout(() => pet.setState(previousState), 900);
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

  if (action === "settings") {
    openSettings();
    return;
  }

  try {
    await invoke(action === "quit" ? "quit_app" : `${action}_pet`);
  } catch (error) {
    console.error(`[koda-desk] failed to run ${action}`, error);
  }
});

settingsPanel.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (target.dataset.action === "close-settings") {
    closeSettings();
  }
});

settingsPet.addEventListener("change", () => {
  selectPet(settingsPet.value);
});

settingsScale.addEventListener("change", () => {
  if (isSupportedScale(settingsScale.value)) {
    selectScale(settingsScale.value);
  }
});

settingsMode.addEventListener("change", () => {
  selectState(settingsState.value, settingsMode.value);
});

settingsState.addEventListener("change", () => {
  selectState(settingsState.value, settingsMode.value);
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

function hydrateSettings(
  config: AppConfig,
  initialPet: string,
  initialScale: PetScale,
  initialState: string,
  registry: PetRegistry,
): void {
  settingsPet.replaceChildren(
    ...registry.pets.map((entry) => new Option(entry.displayName, entry.name)),
  );
  settingsPet.value = initialPet;
  settingsScale.value = initialScale;
  settingsMode.value = config.behavior.mode || "auto";
  settingsState.value = initialState;
  settingsState.disabled = settingsMode.value === "auto";
}

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

function selectPet(petName: string): void {
  const nextPet = petRegistry.get(petName);

  if (!nextPet) {
    console.error(`[koda-desk] unsupported pet selected: ${petName}`);
    return;
  }

  localStorage.setItem("koda-desk.currentPet", nextPet.name);
  settingsPet.value = nextPet.name;
  invoke("set_current_pet", { pet: nextPet.name }).catch((error) => {
    console.error(`[koda-desk] failed to save current pet ${nextPet.name}`, error);
  });
  pet.switchPet(nextPet.manifest).then(() => fitPetWindow()).catch((error) => {
    console.error(`[koda-desk] failed to switch pet to ${nextPet.name}`, error);
  });
}

function selectScale(scale: PetScale): void {
  settingsScale.value = scale;
  const displaySize = pet.setScale(scale);
  fitPetWindow(displaySize).catch((error) => {
    console.error(`[koda-desk] failed to resize pet window for ${scale}`, error);
  });
  invoke("set_pet_scale", { scale }).catch((error) => {
    console.error(`[koda-desk] failed to save pet scale ${scale}`, error);
  });
}

function selectState(state: string, mode: string): void {
  const nextMode = state === "auto" ? "auto" : mode;
  const nextState = nextMode === "auto" ? inferAutomaticState() : state;
  settingsMode.value = nextMode;
  settingsState.value = nextState;
  settingsState.disabled = nextMode === "auto";
  pet.setState(nextState);
  invoke("set_behavior_state", { mode: nextMode, state: nextState }).catch((error) => {
    console.error(`[koda-desk] failed to save pet state ${nextState}`, error);
  });
}

function openSettings(): void {
  document.body.dataset.view = "settings";
  settingsPanel.hidden = false;
  invoke("open_settings").catch((error) => {
    console.error("[koda-desk] failed to open settings", error);
  });
}

function closeSettings(): void {
  settingsPanel.hidden = true;
  delete document.body.dataset.view;
  invoke("close_settings").catch((error) => {
    console.error("[koda-desk] failed to close settings", error);
  });
  fitPetWindow().catch((error) => {
    console.error("[koda-desk] failed to restore pet window size", error);
  });
}

async function fitPetWindow(displaySize: PetDisplaySize = pet.getDisplaySize()): Promise<void> {
  if (!settingsPanel.hidden) {
    return;
  }

  await currentWindow.setSize(new LogicalSize(displaySize.width, displaySize.height));
}

function inferAutomaticState(): string {
  if (document.visibilityState === "hidden") {
    return "waiting";
  }

  const hour = new Date().getHours();
  return hour >= 9 && hour < 19 ? "working" : "idle";
}

function showContextMenu(x: number, y: number): void {
  contextMenu.hidden = false;
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
}

function hideContextMenu(): void {
  contextMenu.hidden = true;
}

function getInitialPet(config: AppConfig, registry: PetRegistry): PetRegistryEntry {
  const urlPet = new URLSearchParams(window.location.search).get("pet");

  if (urlPet && registry.has(urlPet)) {
    localStorage.setItem("koda-desk.currentPet", urlPet);
    return registry.resolve(urlPet);
  }

  const savedPet = localStorage.getItem("koda-desk.currentPet");
  if (savedPet && registry.has(savedPet)) {
    return registry.resolve(savedPet);
  }

  return registry.resolve(config.pet.current);
}

function getInitialPetScale(config: AppConfig): PetScale {
  return isSupportedScale(config.pet.scale) ? config.pet.scale : "medium";
}

function isSupportedScale(value: string): value is PetScale {
  return supportedScales.has(value as PetScale);
}

function queryRequired<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Koda Desk element is missing: ${selector}`);
  }

  return element;
}
