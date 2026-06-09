import { createAnimationPlayer, type AnimationPlayer } from "./animation";
import { loadPetManifest, type PetManifest } from "./petManifest";

export interface PetCanvasController {
  start(): Promise<void>;
  stop(): void;
  switchPet(manifestUrl: string): Promise<void>;
  setScale(scale: PetScale): PetDisplaySize;
  setState(state: string): void;
  getDisplaySize(): PetDisplaySize;
}

export type PetScale = "small" | "medium" | "large";

export interface PetDisplaySize {
  width: number;
  height: number;
}

const scaleFactors: Record<PetScale, number> = {
  small: 0.75,
  medium: 1,
  large: 1.35,
};

export function createPetCanvas(
  canvas: HTMLCanvasElement,
  manifestUrl: string,
  initialScale: PetScale = "medium",
  initialState = "idle",
): PetCanvasController {
  const context = canvas.getContext("2d", { alpha: true });

  if (!context) {
    throw new Error("2D canvas context is unavailable");
  }

  const drawContext = context;
  let animationFrame = 0;
  let currentManifestUrl = manifestUrl;
  let currentManifest: PetManifest | null = null;
  let currentScale = initialScale;
  let currentState = initialState;
  let player: AnimationPlayer | null = null;
  let starting: Promise<void> | null = null;
  let loadVersion = 0;

  async function start(): Promise<void> {
    if (animationFrame || starting) {
      return starting ?? Promise.resolve();
    }

    starting = bootstrap()
      .catch((error) => {
        drawFallback(drawContext, canvas.width, canvas.height);
        throw error;
      })
      .finally(() => {
        starting = null;
      });

    return starting;
  }

  function stop(): void {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      console.info("[koda-desk] animation stopped");
    }
  }

  async function switchPet(nextManifestUrl: string): Promise<void> {
    if (nextManifestUrl === currentManifestUrl && player) {
      return;
    }

    stop();
    currentManifestUrl = nextManifestUrl;
    player = null;
    loadVersion += 1;
    await start();
  }

  function setScale(scale: PetScale): PetDisplaySize {
    currentScale = scale;
    if (currentManifest) {
      resizeCanvas(canvas, currentManifest, currentScale);
    }

    return getDisplaySize();
  }

  function setState(state: string): void {
    currentState = state;
    player?.setState(state);
  }

  function getDisplaySize(): PetDisplaySize {
    return getScaledSize(currentManifest, canvas, currentScale);
  }

  async function bootstrap(): Promise<void> {
    if (!player) {
      const version = loadVersion;
      const manifest = await loadPetManifest(currentManifestUrl);
      currentManifest = manifest;
      resizeCanvas(canvas, manifest, currentScale);
      const image = await loadImage(resolveAssetUrl(currentManifestUrl, manifest.spritesheet));

      if (version !== loadVersion) {
        return;
      }

      player = createAnimationPlayer(drawContext, image, manifest, currentState);
    }

    player.reset();
    tick(0);
    console.info("[koda-desk] animation started");
  }

  function tick(timestamp: number): void {
    player?.draw(timestamp);
    animationFrame = requestAnimationFrame(tick);
  }

  return { start, stop, switchPet, setScale, setState, getDisplaySize };
}

function resizeCanvas(canvas: HTMLCanvasElement, manifest: PetManifest, scale: PetScale): void {
  const displaySize = getScaledSize(manifest, canvas, scale);
  canvas.width = manifest.frame.width;
  canvas.height = manifest.frame.height;
  canvas.style.width = `${displaySize.width}px`;
  canvas.style.height = `${displaySize.height}px`;
}

function getScaledSize(
  manifest: PetManifest | null,
  canvas: HTMLCanvasElement,
  scale: PetScale,
): PetDisplaySize {
  const scaleFactor = scaleFactors[scale];
  const width = manifest?.frame.width ?? canvas.width;
  const height = manifest?.frame.height ?? canvas.height;

  return {
    width: Math.round(width * scaleFactor),
    height: Math.round(height * scaleFactor),
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`spritesheet load failed: ${url}`));
    image.src = url;
  });
}

function resolveAssetUrl(baseUrl: string, assetName: string): string {
  return new URL(assetName, new URL(baseUrl, window.location.href)).toString();
}

function drawFallback(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(32, 32, 32, 0.72)";
  context.beginPath();
  context.roundRect(24, 24, Math.max(48, width - 48), Math.max(48, height - 48), 18);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = "14px sans-serif";
  context.textAlign = "center";
  context.fillText("pet asset missing", width / 2, height / 2);
}
