import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
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

interface PetList {
  pets: Array<{
    name: string;
    displayName?: string;
    manifest: string;
  }>;
}

const supportedPets = new Set(["koda", "lumen"]);
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
const config = await loadConfig();
const initialPet = getInitialPetName(config);
const initialScale = getInitialPetScale(config);
const initialState = config.behavior.mode === "auto" ? inferAutomaticState() : config.behavior.state || "idle";
const pet = createPetCanvas(petCanvas, `/pets/${initialPet}/pet.json`, initialScale, initialState);

await hydrateSettings(config, initialPet, initialScale, initialState);
fitPetWindow(initialScale).catch((error) => {
  console.error("[koda-desk] failed to fit initial pet window", error);
});

pet.start().catch((error) => {
  console.error("[koda-desk] failed to start pet renderer", error);
});

listen<string>("pet:selected", (event) => {
  const petName = event.payload;

  if (!isSupportedPet(petName)) {
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

async function hydrateSettings(
  config: AppConfig,
  initialPet: string,
  initialScale: PetScale,
  initialState: string,
): Promise<void> {
  try {
    const response = await fetch("/pets/pets.json");
    const petList = (await response.json()) as PetList;
    settingsPet.replaceChildren(
      ...petList.pets.map((entry) => new Option(entry.displayName ?? entry.name, entry.name)),
    );
  } catch (error) {
    console.error("[koda-desk] failed to load pet list", error);
    settingsPet.replaceChildren(new Option("Koda", "koda"), new Option("Lumen", "lumen"));
  }

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
  localStorage.setItem("koda-desk.currentPet", petName);
  settingsPet.value = petName;
  invoke("set_current_pet", { pet: petName }).catch((error) => {
    console.error(`[koda-desk] failed to save current pet ${petName}`, error);
  });
  pet.switchPet(`/pets/${petName}/pet.json`).catch((error) => {
    console.error(`[koda-desk] failed to switch pet to ${petName}`, error);
  });
}

function selectScale(scale: PetScale): void {
  settingsScale.value = scale;
  pet.setScale(scale);
  fitPetWindow(scale).catch((error) => {
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
  fitPetWindow(settingsScale.value as PetScale).catch((error) => {
    console.error("[koda-desk] failed to restore pet window size", error);
  });
}

async function fitPetWindow(scale: PetScale): Promise<void> {
  if (!settingsPanel.hidden) {
    return;
  }

  const factor = scale === "small" ? 0.75 : scale === "large" ? 1.35 : 1;
  await currentWindow.setSize(new LogicalSize(Math.round(192 * factor), Math.round(208 * factor)));
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

function queryRequired<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Koda Desk element is missing: ${selector}`);
  }

  return element;
}
