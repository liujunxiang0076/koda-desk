import type {
  PetManifest,
  PetSpritePlacement,
  PetStage,
  WorkstationBox,
  WorkstationKeyboard,
  WorkstationKey,
} from "./petManifest";

export interface AnimationPlayer {
  draw(timestamp: number): void;
  reset(): void;
  setState(state: string): void;
  setInputActivity(activity: PetInputActivity): void;
}

export interface PetInputActivity {
  kind: "keyboard" | "mouse";
  code?: string;
  label?: string;
  receivedAt?: number;
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
  let inputActivity: PetInputActivity | null = null;

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
    const stage = getStage(manifest);
    const sprite = getSpritePlacement(manifest);

    context.clearRect(0, 0, stage.width, stage.height);
    drawWorkstationBase(context, manifest, inputActivity, timestamp);
    context.drawImage(
      image,
      sourceX,
      sourceY,
      manifest.frame.width,
      manifest.frame.height,
      sprite.x,
      sprite.y,
      sprite.width,
      sprite.height,
    );
    drawWorkstationControls(context, manifest, inputActivity, currentState, timestamp);
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
    setInputActivity(activity) {
      inputActivity = {
        ...activity,
        receivedAt: performance.now(),
      };
    },
  };
}

function getStage(manifest: PetManifest): PetStage {
  return manifest.stage ?? {
    width: manifest.frame.width,
    height: manifest.frame.height,
  };
}

function getSpritePlacement(manifest: PetManifest): PetSpritePlacement {
  return manifest.sprite ?? {
    x: 0,
    y: 0,
    width: manifest.frame.width,
    height: manifest.frame.height,
  };
}

function drawWorkstationBase(
  context: CanvasRenderingContext2D,
  manifest: PetManifest,
  activity: PetInputActivity | null,
  timestamp: number,
): void {
  const workstation = manifest.workstation;
  if (!workstation) {
    return;
  }

  if (workstation.monitor) {
    drawMonitor(context, workstation.monitor, isRecentActivity(activity, timestamp, 650));
  }
}

function drawWorkstationControls(
  context: CanvasRenderingContext2D,
  manifest: PetManifest,
  activity: PetInputActivity | null,
  state: string,
  timestamp: number,
): void {
  const workstation = manifest.workstation;
  if (!workstation) {
    return;
  }

  if (workstation.keyboard) {
    drawKeyboard(context, workstation.keyboard, activity, timestamp);
  }

  if (workstation.mouse) {
    drawMouse(
      context,
      workstation.mouse,
      state === "mousing" || (activity?.kind === "mouse" && isRecentActivity(activity, timestamp, 650)),
    );
  }
}

function drawMonitor(
  context: CanvasRenderingContext2D,
  box: WorkstationBox,
  active: boolean,
): void {
  context.save();
  context.fillStyle = "rgba(42, 49, 61, 0.88)";
  roundRect(context, box.x, box.y, box.width, box.height, 8);
  context.fill();
  context.fillStyle = active ? "rgba(124, 203, 255, 0.42)" : "rgba(186, 199, 214, 0.22)";
  roundRect(context, box.x + 5, box.y + 5, box.width - 10, box.height - 12, 5);
  context.fill();
  context.fillStyle = "rgba(42, 49, 61, 0.76)";
  context.fillRect(box.x + box.width * 0.42, box.y + box.height - 2, box.width * 0.16, 10);
  context.restore();
}

function drawKeyboard(
  context: CanvasRenderingContext2D,
  keyboard: WorkstationKeyboard,
  activity: PetInputActivity | null,
  timestamp: number,
): void {
  const activeKey = activity?.kind === "keyboard" && isRecentActivity(activity, timestamp, 360)
    ? normalizeKey(activity.code ?? activity.label ?? "")
    : null;

  context.save();
  context.fillStyle = "rgba(39, 46, 57, 0.92)";
  roundRect(context, keyboard.x, keyboard.y, keyboard.width, keyboard.height, 7);
  context.fill();

  for (const row of keyboard.rows) {
    for (const key of row.keys) {
      const pressed = activeKey ? keyMatches(key, activeKey) : false;
      const x = keyboard.x + key.x;
      const y = keyboard.y + row.y + (pressed ? 1 : 0);

      context.fillStyle = pressed ? "rgba(104, 211, 145, 0.94)" : "rgba(236, 241, 247, 0.9)";
      roundRect(context, x, y, key.width, row.height, 3);
      context.fill();
      context.fillStyle = pressed ? "rgba(22, 78, 99, 0.95)" : "rgba(56, 65, 78, 0.86)";
      context.font = `${Math.max(6, Math.min(9, row.height - 2))}px system-ui, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(key.label, x + key.width / 2, y + row.height / 2 + 0.5);
    }
  }

  context.restore();
}

function drawMouse(context: CanvasRenderingContext2D, box: WorkstationBox, active: boolean): void {
  context.save();
  context.fillStyle = active ? "rgba(104, 211, 145, 0.94)" : "rgba(236, 241, 247, 0.92)";
  roundRect(context, box.x, box.y, box.width, box.height, Math.min(box.width, box.height) / 2);
  context.fill();
  context.strokeStyle = "rgba(56, 65, 78, 0.74)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(box.x + box.width / 2, box.y + 4);
  context.lineTo(box.x + box.width / 2, box.y + box.height * 0.44);
  context.stroke();
  context.restore();
}

function keyMatches(key: WorkstationKey, activeKey: string): boolean {
  return [key.id, key.label, ...(key.aliases ?? [])].some((candidate) => normalizeKey(candidate) === activeKey);
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^key([a-z])$/, "$1")
    .replace(/^digit([0-9])$/, "$1")
    .replace(/^numpad([0-9])$/, "$1")
    .replace(/\s+/g, "");
}

function isRecentActivity(activity: PetInputActivity | null, timestamp: number, maxAgeMs: number): boolean {
  if (!activity?.receivedAt) {
    return false;
  }

  return timestamp - activity.receivedAt <= maxAgeMs;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
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
