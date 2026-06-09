import type { PetManifest } from "./petManifest";

export interface AnimationPlayer {
  draw(timestamp: number): void;
  reset(): void;
  setState(state: string): void;
}

export function createAnimationPlayer(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  manifest: PetManifest,
  state = "idle",
): AnimationPlayer {
  let currentState = state;
  let animation = manifest.animations[currentState] ?? manifest.animations.idle;
  let frameDuration = 1000 / normalizeFps(animation.fps);
  let frameCursor = 0;
  let lastFrameAt = 0;

  function draw(timestamp: number): void {
    if (lastFrameAt === 0) {
      lastFrameAt = timestamp;
    } else if (timestamp - lastFrameAt >= frameDuration) {
      const steps = Math.floor((timestamp - lastFrameAt) / frameDuration);
      frameCursor = advanceCursor(frameCursor, animation.frames.length, animation.loop, steps);
      lastFrameAt += steps * frameDuration;
    }

    const frameIndex = animation.frames[frameCursor] ?? animation.frames[0] ?? 0;
    const sourceX = (frameIndex % manifest.frame.columns) * manifest.frame.width;
    const sourceY = Math.floor(frameIndex / manifest.frame.columns) * manifest.frame.height;

    context.clearRect(0, 0, manifest.frame.width, manifest.frame.height);
    context.drawImage(
      image,
      sourceX,
      sourceY,
      manifest.frame.width,
      manifest.frame.height,
      0,
      0,
      manifest.frame.width,
      manifest.frame.height,
    );
  }

  return {
    draw,
    reset() {
      frameCursor = 0;
      lastFrameAt = 0;
    },
    setState(nextState: string) {
      const nextAnimation = manifest.animations[nextState] ?? manifest.animations.idle;
      if (nextAnimation === animation && nextState === currentState) {
        return;
      }

      currentState = nextState;
      animation = nextAnimation;
      frameDuration = 1000 / normalizeFps(animation.fps);
      frameCursor = 0;
      lastFrameAt = 0;
    },
  };
}

function advanceCursor(current: number, total: number, loop: boolean, steps: number): number {
  if (total <= 1) {
    return 0;
  }

  const next = current + Math.max(1, steps);
  return loop ? next % total : Math.min(next, total - 1);
}

function normalizeFps(value: number): number {
  return Number.isFinite(value) ? clamp(value, 1, 24) : 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
