import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createPetCanvas } from "./renderer/petCanvas";
import "./styles/app.css";

const canvas = document.querySelector<HTMLCanvasElement>("#pet-canvas");
const menu = document.querySelector<HTMLDivElement>("#context-menu");

if (!canvas || !menu) {
  throw new Error("Koda Desk root elements are missing.");
}

const petCanvas = canvas;
const contextMenu = menu;

const pet = createPetCanvas(petCanvas, `/pets/${getInitialPetName()}/pet.json`);
pet.start().catch((error) => {
  console.error("[koda-desk] failed to start pet renderer", error);
});

petCanvas.addEventListener("mousedown", async (event) => {
  if (event.button !== 0) {
    return;
  }

  hideContextMenu();

  try {
    await getCurrentWindow().startDragging();
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

function showContextMenu(x: number, y: number): void {
  contextMenu.hidden = false;
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
}

function hideContextMenu(): void {
  contextMenu.hidden = true;
}

function getInitialPetName(): string {
  const supportedPets = new Set(["koda", "lumen", "default"]);
  const urlPet = new URLSearchParams(window.location.search).get("pet");

  if (urlPet && supportedPets.has(urlPet)) {
    localStorage.setItem("koda-desk.currentPet", urlPet);
    return urlPet;
  }

  const savedPet = localStorage.getItem("koda-desk.currentPet");
  if (savedPet && supportedPets.has(savedPet)) {
    return savedPet;
  }

  return "koda";
}
