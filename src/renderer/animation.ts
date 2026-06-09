import type {
  PetManifest,
  PetSpritePlacement,
  PetStage,
  WorkstationAssetLayer,
  WorkstationBox,
  WorkstationKeyboard,
  WorkstationKey,
  WorkstationPoint,
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

export interface LoadedWorkstationAsset {
  image: HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: WorkstationAssetLayer;
}

export function createAnimationPlayer(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  manifest: PetManifest,
  state = "idle",
  workstationAssets: LoadedWorkstationAsset[] = [],
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
    drawWorkstationAssets(context, workstationAssets, "back");
    drawWorkstationBase(context, manifest, inputActivity, timestamp, workstationAssets.length > 0);
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
    drawWorkstationAssets(context, workstationAssets, "front");
    drawWorkstationControls(context, manifest, inputActivity, currentState, timestamp, workstationAssets.length > 0);
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
  hasAssetLayer: boolean,
): void {
  const workstation = manifest.workstation;
  if (!workstation) {
    return;
  }

  if (workstation.monitor && hasAssetLayer && isRecentActivity(activity, timestamp, 650)) {
    drawMonitorGlow(context, workstation.monitor);
    return;
  }

  if (workstation.monitor && !hasAssetLayer) {
    drawMonitor(context, workstation.monitor, isRecentActivity(activity, timestamp, 650));
  }
}

function drawWorkstationControls(
  context: CanvasRenderingContext2D,
  manifest: PetManifest,
  activity: PetInputActivity | null,
  state: string,
  timestamp: number,
  hasAssetLayer: boolean,
): void {
  const workstation = manifest.workstation;
  if (!workstation) {
    return;
  }

  let keyTarget: InputTarget | null = null;
  if (workstation.keyboard) {
    keyTarget = drawKeyboard(context, workstation.keyboard, activity, timestamp, hasAssetLayer);
  }

  const mouseActive = state === "mousing" || (activity?.kind === "mouse" && isRecentActivity(activity, timestamp, 650));
  if (workstation.mouse) {
    drawMouse(context, workstation.mouse, mouseActive, hasAssetLayer);
  }

  if (keyTarget) {
    drawHandCue(context, getKeyboardHandAnchor(manifest, keyTarget), keyTarget, "rgba(104, 211, 145, 0.92)");
  }

  if (workstation.mouse && mouseActive) {
    const mouseTarget = {
      x: workstation.mouse.x + workstation.mouse.width / 2,
      y: workstation.mouse.y + workstation.mouse.height * 0.56,
      label: "",
      hand: "mouse" as const,
    };
    drawHandCue(context, getMouseHandAnchor(manifest), mouseTarget, "rgba(99, 179, 237, 0.9)");
  }
}

function drawWorkstationAssets(
  context: CanvasRenderingContext2D,
  assets: LoadedWorkstationAsset[],
  layer: WorkstationAssetLayer,
): void {
  for (const asset of assets) {
    if (asset.layer !== layer) {
      continue;
    }

    context.drawImage(asset.image, asset.x, asset.y, asset.width, asset.height);
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

function drawMonitorGlow(context: CanvasRenderingContext2D, box: WorkstationBox): void {
  context.save();
  context.fillStyle = "rgba(124, 203, 255, 0.24)";
  roundRect(context, box.x + 5, box.y + 5, box.width - 10, box.height - 12, 5);
  context.fill();
  context.restore();
}

interface InputTarget extends WorkstationPoint {
  label: string;
  hand: "left" | "right" | "mouse";
}

function drawKeyboard(
  context: CanvasRenderingContext2D,
  keyboard: WorkstationKeyboard,
  activity: PetInputActivity | null,
  timestamp: number,
  hasAssetLayer: boolean,
): InputTarget | null {
  const activeKey = activity?.kind === "keyboard" && isRecentActivity(activity, timestamp, 360)
    ? normalizeKey(activity.code ?? activity.label ?? "")
    : null;
  const renderMode = keyboard.renderMode ?? (hasAssetLayer ? "highlightOnly" : "full");
  const activeTarget = activeKey ? findActiveKeyTarget(keyboard, activeKey) : null;

  context.save();
  if (renderMode === "full") {
    context.fillStyle = "rgba(39, 46, 57, 0.92)";
    roundRect(context, keyboard.x, keyboard.y, keyboard.width, keyboard.height, 7);
    context.fill();
  }

  for (const row of keyboard.rows) {
    for (const key of row.keys) {
      const pressed = activeKey ? keyMatches(key, activeKey) : false;
      if (renderMode === "highlightOnly" && !pressed) {
        continue;
      }

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
  return activeTarget;
}

function drawMouse(
  context: CanvasRenderingContext2D,
  box: WorkstationBox,
  active: boolean,
  hasAssetLayer: boolean,
): void {
  if (hasAssetLayer && !active) {
    return;
  }

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

function findActiveKeyTarget(keyboard: WorkstationKeyboard, activeKey: string): InputTarget | null {
  for (const row of keyboard.rows) {
    for (const key of row.keys) {
      if (!keyMatches(key, activeKey)) {
        continue;
      }

      const x = keyboard.x + key.x + key.width / 2;
      return {
        x,
        y: keyboard.y + row.y + row.height / 2,
        label: key.label,
        hand: x < keyboard.x + keyboard.width * 0.54 ? "left" : "right",
      };
    }
  }

  return null;
}

function drawHandCue(
  context: CanvasRenderingContext2D,
  anchor: WorkstationPoint,
  target: InputTarget,
  color: string,
): void {
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 2;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(anchor.x, anchor.y);
  context.quadraticCurveTo((anchor.x + target.x) / 2, Math.min(anchor.y, target.y) - 16, target.x, target.y);
  context.stroke();
  context.globalAlpha = 0.9;
  context.beginPath();
  context.arc(target.x, target.y, target.hand === "mouse" ? 5 : 4, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function getKeyboardHandAnchor(manifest: PetManifest, target: InputTarget): WorkstationPoint {
  const anchors = manifest.workstation?.handAnchors;
  if (target.hand === "left" && anchors?.left) {
    return anchors.left;
  }

  if (target.hand === "right" && anchors?.right) {
    return anchors.right;
  }

  const sprite = getSpritePlacement(manifest);
  return target.hand === "left"
    ? { x: sprite.x + sprite.width * 0.55, y: sprite.y + sprite.height * 0.64 }
    : { x: sprite.x + sprite.width * 0.72, y: sprite.y + sprite.height * 0.64 };
}

function getMouseHandAnchor(manifest: PetManifest): WorkstationPoint {
  if (manifest.workstation?.handAnchors?.mouse) {
    return manifest.workstation.handAnchors.mouse;
  }

  const sprite = getSpritePlacement(manifest);
  return { x: sprite.x + sprite.width * 0.72, y: sprite.y + sprite.height * 0.66 };
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
