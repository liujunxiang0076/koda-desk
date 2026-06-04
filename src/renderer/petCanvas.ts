import { createAnimationPlayer, type AnimationPlayer } from "./animation";
import { loadPetManifest, type PetManifest } from "./petManifest";

export interface PetCanvasController {
  start(): Promise<void>;
  stop(): void;
}

export function createPetCanvas(canvas: HTMLCanvasElement, manifestUrl: string): PetCanvasController {
  const context = canvas.getContext("2d", { alpha: true });

  if (!context) {
    throw new Error("2D canvas context is unavailable");
  }

  const drawContext = context;
  let animationFrame = 0;
  let player: AnimationPlayer | null = null;
  let starting: Promise<void> | null = null;

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
    }
  }

  async function bootstrap(): Promise<void> {
    if (!player) {
      const manifest = await loadPetManifest(manifestUrl);
      resizeCanvas(canvas, manifest);
      const image = await loadImage(resolveAssetUrl(manifestUrl, manifest.spritesheet));
      player = createAnimationPlayer(drawContext, image, manifest);
    }

    player.reset();
    tick(0);
  }

  function tick(timestamp: number): void {
    player?.draw(timestamp);
    animationFrame = requestAnimationFrame(tick);
  }

  return { start, stop };
}

function resizeCanvas(canvas: HTMLCanvasElement, manifest: PetManifest): void {
  canvas.width = manifest.frame.width;
  canvas.height = manifest.frame.height;
  canvas.style.width = `${manifest.frame.width}px`;
  canvas.style.height = `${manifest.frame.height}px`;
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
