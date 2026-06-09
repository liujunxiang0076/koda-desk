import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { createPetCanvas, type PetDisplaySize, type PetScale } from "./renderer/petCanvas";
import { loadPetRegistry, type PetRegistry, type PetRegistryEntry } from "./renderer/petRegistry";
import {
  createPetStateController,
  toBehaviorMode,
  toPetState,
  type PetState,
  type PetStateSnapshot,
} from "./renderer/petState";
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
  startup: {
    launchOnBoot: boolean;
  };
}

const supportedScales = new Set<PetScale>(["small", "medium", "large"]);
const clickReactionDurationMs = 900;
const dragClickSuppressDistance = 4;
const tauriRuntime = isTauri();
const currentWindow = tauriRuntime ? getCurrentWindow() : null;
const canvas = queryRequired<HTMLCanvasElement>("#pet-canvas");
const menu = queryRequired<HTMLDivElement>("#context-menu");
const settingsPanel = queryRequired<HTMLElement>("#settings-panel");
const settingsPet = queryRequired<HTMLSelectElement>("#settings-pet");
const settingsScale = queryRequired<HTMLSelectElement>("#settings-scale");
const settingsMode = queryRequired<HTMLSelectElement>("#settings-mode");
const settingsState = queryRequired<HTMLSelectElement>("#settings-state");
const settingsAutostart = queryRequired<HTMLInputElement>("#settings-autostart");

const petCanvas = canvas;
const contextMenu = menu;
const petRegistry = await loadPetRegistry();
const config = await loadConfig();
const initialPet = getInitialPet(config, petRegistry);
const initialScale = getInitialPetScale(config);
const initialMode = toBehaviorMode(config.behavior.mode);
const initialManualState = toPetState(config.behavior.state);
let petVisible = !document.hidden;
let lastDragEndedAt = 0;
let lastDragMoved = false;

const initialState = initialMode === "auto" ? inferAutomaticState() : initialManualState;
const pet = createPetCanvas(petCanvas, initialPet.manifest, initialScale, initialState);
const stateController = createPetStateController({
  mode: initialMode,
  state: initialManualState,
  inferAutomaticState,
  onStateChange(snapshot) {
    pet.setState(snapshot.activeState);
    syncBehaviorSettings(snapshot);
  },
});

hydrateSettings(stateController.snapshot(), initialPet.name, initialScale, petRegistry);
settingsAutostart.checked = config.startup.launchOnBoot;
syncAutostartSetting(config.startup.launchOnBoot).catch((error) => {
  console.error("[koda-desk] failed to sync autostart setting", error);
});
pet.start().then(() => fitPetWindow()).catch((error) => {
  console.error("[koda-desk] failed to start pet renderer", error);
});

subscribeTauriEvent<string>("pet:selected", (petName) => {
  if (!petRegistry.has(petName)) {
    console.error(`[koda-desk] unsupported pet selected: ${petName}`);
    return;
  }

  selectPet(petName);
  setPetVisibility(true);
});

subscribeTauriEvent<string>("pet:scale", (scale) => {
  if (!isSupportedScale(scale)) {
    console.error(`[koda-desk] unsupported pet scale: ${scale}`);
    return;
  }

  selectScale(scale);
});

subscribeTauriEvent<string>("pet:state", (state) => {
  selectState(state, state === "auto" ? "auto" : "manual");
});

subscribeTauriEvent<boolean>("pet:visibility", (visible) => {
  setPetVisibility(visible);
});

subscribeTauriEvent("settings:open", () => {
  openSettings();
});

petCanvas.addEventListener("mousedown", async (event) => {
  if (event.button !== 0 || !settingsPanel.hidden) {
    return;
  }

  hideContextMenu();

  if (!currentWindow) {
    return;
  }

  const token = stateController.beginTemporaryState("dragging");
  let startPosition: { x: number; y: number } | null = null;

  try {
    startPosition = await currentWindow.outerPosition();
    await currentWindow.startDragging();
    const endPosition = await currentWindow.outerPosition();
    const distance = startPosition
      ? Math.abs(endPosition.x - startPosition.x) + Math.abs(endPosition.y - startPosition.y)
      : 0;

    lastDragMoved = distance > dragClickSuppressDistance;
    lastDragEndedAt = performance.now();
    await saveWindowPosition();
  } catch (error) {
    console.error("[koda-desk] failed to start window dragging", error);
  } finally {
    stateController.endTemporaryState(token);
  }
});

petCanvas.addEventListener("click", () => {
  if (!settingsPanel.hidden || shouldSuppressClickReaction()) {
    return;
  }

  const token = stateController.beginTemporaryState("review");
  window.setTimeout(() => {
    stateController.endTemporaryState(token);
  }, clickReactionDurationMs);
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

  if (!["hide", "show", "quit"].includes(action)) {
    return;
  }

  try {
    await invokeTauri(action === "quit" ? "quit_app" : `${action}_pet`);
    if (action === "hide") {
      setPetVisibility(false);
    }
    if (action === "show") {
      setPetVisibility(true);
    }
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

settingsAutostart.addEventListener("change", () => {
  setLaunchOnBoot(settingsAutostart.checked).catch((error) => {
    console.error("[koda-desk] failed to update launch on boot", error);
  });
});

document.addEventListener("visibilitychange", () => {
  setPetVisibility(!document.hidden);
});

window.setInterval(() => {
  stateController.refreshAutomaticState();
}, 60_000);

function hydrateSettings(
  snapshot: PetStateSnapshot,
  initialPet: string,
  initialScale: PetScale,
  registry: PetRegistry,
): void {
  settingsPet.replaceChildren(
    ...registry.pets.map((entry) => new Option(entry.displayName, entry.name)),
  );
  settingsPet.value = initialPet;
  settingsScale.value = initialScale;
  syncBehaviorSettings(snapshot);
}

function syncBehaviorSettings(snapshot: PetStateSnapshot): void {
  settingsMode.value = snapshot.mode;
  settingsState.value = snapshot.baseState;
  settingsState.disabled = snapshot.mode === "auto";
}

async function loadConfig(): Promise<AppConfig> {
  if (!tauriRuntime) {
    return defaultConfig();
  }

  try {
    return await invoke<AppConfig>("get_config");
  } catch (error) {
    console.error("[koda-desk] failed to load config, using defaults", error);
    return defaultConfig();
  }
}

function defaultConfig(): AppConfig {
  return {
    pet: { current: "koda", scale: "medium" },
    behavior: { mode: "auto", state: "idle" },
    startup: { launchOnBoot: false },
  };
}

async function saveWindowPosition(): Promise<void> {
  if (!currentWindow) {
    return;
  }

  const position = await currentWindow.outerPosition();
  await invokeTauri("save_window_position", { x: position.x, y: position.y });
}

function selectPet(petName: string): void {
  const nextPet = petRegistry.get(petName);

  if (!nextPet) {
    console.error(`[koda-desk] unsupported pet selected: ${petName}`);
    return;
  }

  localStorage.setItem("koda-desk.currentPet", nextPet.name);
  settingsPet.value = nextPet.name;
  invokeTauri("set_current_pet", { pet: nextPet.name }).catch((error) => {
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
  invokeTauri("set_pet_scale", { scale }).catch((error) => {
    console.error(`[koda-desk] failed to save pet scale ${scale}`, error);
  });
}

function selectState(state: string, mode: string): void {
  let snapshot: PetStateSnapshot;

  if (state === "auto" || mode === "auto") {
    snapshot = stateController.setMode("auto");
  } else {
    const manualState = toPetState(state);
    stateController.setMode("manual");
    snapshot = stateController.setManualState(manualState);
  }

  persistBehavior(snapshot);
}

function persistBehavior(snapshot: PetStateSnapshot): void {
  const state = snapshot.mode === "auto" ? snapshot.baseState : snapshot.manualState;
  invokeTauri("set_behavior_state", { mode: snapshot.mode, state }).catch((error) => {
    console.error(`[koda-desk] failed to save pet behavior ${snapshot.mode}/${state}`, error);
  });
}

async function syncAutostartSetting(fallback: boolean): Promise<void> {
  if (!tauriRuntime) {
    settingsAutostart.checked = false;
    settingsAutostart.disabled = true;
    return;
  }

  try {
    const enabled = await isAutostartEnabled();
    settingsAutostart.checked = enabled;

    if (enabled !== fallback) {
      await persistLaunchOnBoot(enabled);
    }
  } catch (error) {
    settingsAutostart.checked = fallback;
    console.error("[koda-desk] failed to read launch on boot status", error);
  }
}

async function setLaunchOnBoot(enabled: boolean): Promise<void> {
  if (!tauriRuntime) {
    settingsAutostart.checked = false;
    return;
  }

  settingsAutostart.disabled = true;

  try {
    if (enabled) {
      await enableAutostart();
    } else {
      await disableAutostart();
    }

    settingsAutostart.checked = enabled;
    await persistLaunchOnBoot(enabled);
  } catch (error) {
    try {
      settingsAutostart.checked = await isAutostartEnabled();
    } catch {
      settingsAutostart.checked = !enabled;
    }

    throw error;
  } finally {
    settingsAutostart.disabled = false;
  }
}

function persistLaunchOnBoot(enabled: boolean): Promise<AppConfig | undefined> {
  return invokeTauri<AppConfig>("set_launch_on_boot", { enabled });
}

function openSettings(): void {
  pet.stop();
  document.body.dataset.view = "settings";
  settingsPanel.hidden = false;
  invokeTauri("open_settings").catch((error) => {
    console.error("[koda-desk] failed to open settings", error);
  });
}

function closeSettings(): void {
  settingsPanel.hidden = true;
  delete document.body.dataset.view;

  if (petVisible) {
    pet.start().catch((error) => {
      console.error("[koda-desk] failed to resume pet renderer after settings", error);
    });
  }

  fitPetWindow().catch((error) => {
    console.error("[koda-desk] failed to restore pet window size", error);
  });
}

async function fitPetWindow(displaySize: PetDisplaySize = pet.getDisplaySize()): Promise<void> {
  if (!currentWindow || !settingsPanel.hidden) {
    return;
  }

  await currentWindow.setSize(new LogicalSize(displaySize.width, displaySize.height));
}

function setPetVisibility(visible: boolean): void {
  petVisible = visible;

  if (!visible) {
    pet.stop();
    stateController.refreshAutomaticState();
    console.info("[koda-desk] animation paused");
    return;
  }

  if (settingsPanel.hidden) {
    pet.start().then(() => fitPetWindow()).catch((error) => {
      console.error("[koda-desk] failed to resume pet renderer", error);
    });
  }
  stateController.refreshAutomaticState();
  console.info("[koda-desk] animation resumed");
}

function inferAutomaticState(): PetState {
  if (!petVisible || document.visibilityState === "hidden") {
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

function shouldSuppressClickReaction(): boolean {
  if (!lastDragMoved || performance.now() - lastDragEndedAt > 500) {
    return false;
  }

  lastDragMoved = false;
  return true;
}

function subscribeTauriEvent<T>(eventName: string, handler: (payload: T) => void): void {
  if (!tauriRuntime) {
    return;
  }

  listen<T>(eventName, (event) => {
    handler(event.payload);
  }).catch((error) => {
    console.error(`[koda-desk] failed to subscribe ${eventName}`, error);
  });
}

function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T | undefined> {
  if (!tauriRuntime) {
    return Promise.resolve(undefined);
  }

  return invoke<T>(command, args);
}

function queryRequired<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Koda Desk element is missing: ${selector}`);
  }

  return element;
}
