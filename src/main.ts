import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
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
    inputTrackingEnabled: boolean;
  };
  startup: {
    launchOnBoot: boolean;
  };
}

interface InputActivityPayload {
  kind: "keyboard" | "mouse";
  code?: string;
  label?: string;
}

const supportedScales = new Set<PetScale>(["small", "medium", "large"]);
const clickReactionDurationMs = 900;
const dragClickSuppressDistance = 4;
const contextMenuViewportPadding = 6;
const automaticStateRefreshMs = 500;
const typingActivityHoldMs = 1_200;
const mouseActivityHoldMs = 900;
const workingActivityHoldMs = 5_000;
const browserMouseActivityThrottleMs = 90;
const settingsWindowSize = {
  width: 340,
  height: 510,
};
const tauriRuntime = isTauri();
const currentWindow = tauriRuntime ? getCurrentWindow() : null;
const canvas = queryRequired<HTMLCanvasElement>("#pet-canvas");
const menu = queryRequired<HTMLDivElement>("#context-menu");
const settingsPanel = queryRequired<HTMLElement>("#settings-panel");
const settingsPet = queryRequired<HTMLSelectElement>("#settings-pet");
const settingsScale = queryRequired<HTMLSelectElement>("#settings-scale");
const settingsMode = queryRequired<HTMLSelectElement>("#settings-mode");
const settingsState = queryRequired<HTMLSelectElement>("#settings-state");
const settingsInputTracking = queryRequired<HTMLInputElement>("#settings-input-tracking");
const settingsAutostart = queryRequired<HTMLInputElement>("#settings-autostart");
const settingsCloseButton = queryRequired<HTMLButtonElement>("[data-action='close-settings']");

const petCanvas = canvas;
const contextMenu = menu;
const petRegistry = await loadPetRegistry();
const config = await loadConfig();
const initialPet = getInitialPet(config, petRegistry);
const initialScale = getInitialPetScale(config);
const initialMode = toBehaviorMode(config.behavior.mode);
const initialManualState = toPetState(config.behavior.state);
let petVisible = true;
let lastDragEndedAt = 0;
let lastDragMoved = false;
let lastInputActivityAt = Number.NEGATIVE_INFINITY;
let lastKeyboardActivityAt = Number.NEGATIVE_INFINITY;
let lastMouseActivityAt = Number.NEGATIVE_INFINITY;
let inputTrackingEnabled = config.behavior.inputTrackingEnabled;
let petPositionBeforeSettings: { x: number; y: number } | null = null;

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
settingsInputTracking.checked = inputTrackingEnabled;
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
  openSettings().catch((error) => {
    console.error("[koda-desk] failed to open settings from event", error);
  });
});

subscribeTauriEvent<InputActivityPayload>("input:activity", handleInputActivity);
installBrowserInputDebugEvents();

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
    openSettings().catch((error) => {
      console.error("[koda-desk] failed to open settings from context menu", error);
    });
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
    requestCloseSettings();
  }
});

settingsCloseButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  requestCloseSettings();
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

settingsInputTracking.addEventListener("change", () => {
  setInputTrackingEnabled(settingsInputTracking.checked).catch((error) => {
    console.error("[koda-desk] failed to update input tracking", error);
  });
});

settingsAutostart.addEventListener("change", () => {
  setLaunchOnBoot(settingsAutostart.checked).catch((error) => {
    console.error("[koda-desk] failed to update launch on boot", error);
  });
});

window.setInterval(() => {
  if (stateController.snapshot().mode === "auto") {
    stateController.refreshAutomaticState();
  }
}, automaticStateRefreshMs);

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
    behavior: { mode: "auto", state: "idle", inputTrackingEnabled: true },
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

async function setInputTrackingEnabled(enabled: boolean): Promise<void> {
  inputTrackingEnabled = enabled;
  settingsInputTracking.checked = enabled;

  try {
    await invokeTauri<AppConfig>("set_input_tracking_enabled", { enabled });
  } catch (error) {
    inputTrackingEnabled = !enabled;
    settingsInputTracking.checked = inputTrackingEnabled;
    throw error;
  }
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

async function openSettings(): Promise<void> {
  if (!settingsPanel.hidden) {
    return;
  }

  await rememberPetWindowPosition();
  pet.stop();
  document.body.dataset.view = "settings";
  settingsPanel.hidden = false;

  try {
    await invokeTauri("open_settings");
    await keepSettingsWindowOnScreen();
  } catch (error) {
    console.error("[koda-desk] failed to open settings", error);
  }
}

async function closeSettings(): Promise<void> {
  if (settingsPanel.hidden) {
    return;
  }

  settingsPanel.hidden = true;
  delete document.body.dataset.view;

  if (petVisible) {
    pet.start().catch((error) => {
      console.error("[koda-desk] failed to resume pet renderer after settings", error);
    });
  }

  try {
    await fitPetWindow();
    await restorePetWindowPosition();
  } catch (error) {
    console.error("[koda-desk] failed to restore pet window after settings", error);
  }
}

function requestCloseSettings(): void {
  closeSettings().catch((error) => {
    console.error("[koda-desk] failed to close settings", error);
  });
}

async function fitPetWindow(displaySize: PetDisplaySize = pet.getDisplaySize()): Promise<void> {
  if (!currentWindow || !settingsPanel.hidden) {
    return;
  }

  await currentWindow.setSize(new LogicalSize(displaySize.width, displaySize.height));
}

async function rememberPetWindowPosition(): Promise<void> {
  if (!currentWindow) {
    return;
  }

  try {
    const position = await currentWindow.outerPosition();
    petPositionBeforeSettings = { x: position.x, y: position.y };
  } catch (error) {
    petPositionBeforeSettings = null;
    console.error("[koda-desk] failed to remember pet position before settings", error);
  }
}

async function restorePetWindowPosition(): Promise<void> {
  if (!currentWindow || !petPositionBeforeSettings) {
    return;
  }

  const position = petPositionBeforeSettings;
  petPositionBeforeSettings = null;
  await currentWindow.setPosition(new PhysicalPosition(position.x, position.y));
}

async function keepSettingsWindowOnScreen(): Promise<void> {
  if (!currentWindow) {
    return;
  }

  const position = await currentWindow.outerPosition();
  const screen = window.screen as Screen & { availLeft?: number; availTop?: number };
  const screenLeft = screen.availLeft ?? 0;
  const screenTop = screen.availTop ?? 0;
  const maxLeft = Math.max(screenLeft, screenLeft + screen.availWidth - settingsWindowSize.width);
  const maxTop = Math.max(screenTop, screenTop + screen.availHeight - settingsWindowSize.height);
  const left = clamp(position.x, screenLeft, maxLeft);
  const top = clamp(position.y, screenTop, maxTop);

  if (left !== position.x || top !== position.y) {
    await currentWindow.setPosition(new PhysicalPosition(Math.round(left), Math.round(top)));
  }
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

function handleInputActivity(activity: InputActivityPayload): void {
  if (!inputTrackingEnabled || !petVisible || !settingsPanel.hidden) {
    return;
  }

  const now = performance.now();
  lastInputActivityAt = now;

  if (activity.kind === "keyboard") {
    lastKeyboardActivityAt = now;
  }

  if (activity.kind === "mouse") {
    lastMouseActivityAt = now;
  }

  pet.setInputActivity(activity);

  if (stateController.snapshot().mode === "auto") {
    stateController.refreshAutomaticState();
  }
}

function installBrowserInputDebugEvents(): void {
  if (tauriRuntime) {
    return;
  }

  let lastMouseActivityAt = 0;

  document.addEventListener("keydown", (event) => {
    handleInputActivity({
      kind: "keyboard",
      code: event.code,
      label: event.key,
    });
  });

  document.addEventListener("mousemove", () => {
    const now = performance.now();
    if (now - lastMouseActivityAt < browserMouseActivityThrottleMs) {
      return;
    }

    lastMouseActivityAt = now;
    handleInputActivity({
      kind: "mouse",
    });
  });
}

function inferAutomaticState(): PetState {
  if (!petVisible || !settingsPanel.hidden) {
    return "waiting";
  }

  const now = performance.now();
  if (now - lastKeyboardActivityAt <= typingActivityHoldMs) {
    return "typing";
  }

  if (now - lastMouseActivityAt <= mouseActivityHoldMs) {
    return "mousing";
  }

  if (now - lastInputActivityAt <= workingActivityHoldMs) {
    return "working";
  }

  return "idle";
}

function showContextMenu(x: number, y: number): void {
  contextMenu.hidden = false;
  contextMenu.style.left = "0px";
  contextMenu.style.top = "0px";

  const menuRect = contextMenu.getBoundingClientRect();
  const maxLeft = Math.max(contextMenuViewportPadding, window.innerWidth - menuRect.width - contextMenuViewportPadding);
  const maxTop = Math.max(contextMenuViewportPadding, window.innerHeight - menuRect.height - contextMenuViewportPadding);
  const left = clamp(x, contextMenuViewportPadding, maxLeft);
  const top = clamp(y, contextMenuViewportPadding, maxTop);

  contextMenu.style.left = `${left}px`;
  contextMenu.style.top = `${top}px`;
}

function hideContextMenu(): void {
  contextMenu.hidden = true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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
