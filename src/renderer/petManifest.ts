export interface PetManifest {
  name: string;
  displayName: string;
  description: string;
  version: string;
  spritesheet: string;
  stage?: PetStage;
  sprite?: PetSpritePlacement;
  frame: {
    width: number;
    height: number;
    columns: number;
    rows: number;
  };
  animations: Record<string, PetAnimation>;
  workstation?: WorkstationManifest;
}

export interface PetAnimation {
  frames: number[];
  fps: number;
  loop: boolean;
}

export interface PetStage {
  width: number;
  height: number;
}

export interface PetSpritePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorkstationBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorkstationPoint {
  x: number;
  y: number;
}

export type WorkstationAssetLayer = "back" | "front";

export interface WorkstationAsset {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer?: WorkstationAssetLayer;
}

export interface WorkstationKey {
  id: string;
  label: string;
  x: number;
  width: number;
  aliases?: string[];
}

export interface WorkstationKeyRow {
  y: number;
  height: number;
  keys: WorkstationKey[];
}

export interface WorkstationKeyboard extends WorkstationBox {
  renderMode?: "full" | "highlightOnly";
  rows: WorkstationKeyRow[];
}

export interface WorkstationManifest {
  assets?: WorkstationAsset[];
  handAnchors?: {
    left?: WorkstationPoint;
    right?: WorkstationPoint;
    mouse?: WorkstationPoint;
  };
  monitor?: WorkstationBox;
  keyboard?: WorkstationKeyboard;
  mouse?: WorkstationBox;
}

const fullStateAnimations = {
  idle: {
    frames: [0, 1, 2, 3, 4, 5, 6, 7],
    fps: 8,
    loop: true,
  },
  working: {
    frames: [8, 9, 10, 11, 12, 13, 14, 15],
    fps: 12,
    loop: true,
  },
  typing: {
    frames: [8, 9, 10, 11, 12, 13, 14, 15],
    fps: 12,
    loop: true,
  },
  mousing: {
    frames: [8, 9, 10, 11, 12, 13, 14, 15],
    fps: 10,
    loop: true,
  },
  waiting: {
    frames: [16, 17, 18, 19, 20, 21, 22, 23],
    fps: 6,
    loop: true,
  },
  failed: {
    frames: [24, 25, 26, 27, 28, 29, 30, 31],
    fps: 7,
    loop: true,
  },
  review: {
    frames: [32, 33, 34, 35, 36, 37, 38, 39],
    fps: 9,
    loop: true,
  },
  dragging: {
    frames: [40, 41, 42, 43, 44, 45, 46, 47],
    fps: 10,
    loop: true,
  },
};

export async function loadPetManifest(url: string): Promise<PetManifest> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`pet manifest request failed: ${response.status} ${response.statusText}`);
  }

  const manifest = normalizePetManifest((await response.json()) as unknown, url);
  assertPetManifest(manifest);
  return manifest;
}

function normalizePetManifest(value: unknown, url: string): PetManifest {
  if (!isRecord(value)) {
    throw new Error("pet manifest must be an object");
  }

  if (typeof value.spritesheetPath === "string") {
    const name = derivePetName(url);
    return {
      name,
      displayName: typeof value.displayName === "string" ? value.displayName : name,
      description: typeof value.description === "string" ? value.description : "",
      version: "1.0.0",
      spritesheet: value.spritesheetPath,
      frame: {
        width: 192,
        height: 208,
        columns: 8,
        rows: 9,
      },
      animations: fullStateAnimations,
    };
  }

  return {
    ...value,
    displayName: typeof value.displayName === "string" ? value.displayName : String(value.name ?? ""),
    description: typeof value.description === "string" ? value.description : "",
  } as PetManifest;
}

function assertPetManifest(value: unknown): asserts value is PetManifest {
  if (!isRecord(value)) {
    throw new Error("pet manifest must be an object");
  }

  if (
    typeof value.name !== "string" ||
    typeof value.displayName !== "string" ||
    typeof value.description !== "string" ||
    typeof value.version !== "string" ||
    typeof value.spritesheet !== "string" ||
    !isRecord(value.frame) ||
    !isRecord(value.animations)
  ) {
    throw new Error("pet manifest is missing required fields");
  }

  const { width, height, columns, rows } = value.frame;
  if (![width, height, columns, rows].every(isPositiveInteger)) {
    throw new Error("pet frame values must be positive integers");
  }

  const idle = value.animations.idle;
  if (!isRecord(idle) || !Array.isArray(idle.frames) || typeof idle.fps !== "number") {
    throw new Error("pet manifest must define an idle animation");
  }

  const maxFrameIndex = Number(value.frame.columns) * Number(value.frame.rows) - 1;
  for (const [name, animation] of Object.entries(value.animations)) {
    if (
      !isRecord(animation) ||
      !Array.isArray(animation.frames) ||
      animation.frames.length === 0 ||
      typeof animation.fps !== "number" ||
      !Number.isFinite(animation.fps) ||
      typeof animation.loop !== "boolean"
    ) {
      throw new Error(`pet animation ${name} is invalid`);
    }

    for (const frame of animation.frames) {
      if (!Number.isInteger(frame) || frame < 0 || frame > maxFrameIndex) {
        throw new Error(`pet animation ${name} contains invalid frame index ${String(frame)}`);
      }
    }
  }

  assertOptionalStage(value.stage);
  assertOptionalSprite(value.sprite);
  assertOptionalWorkstation(value.workstation);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertOptionalStage(value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value) || !isPositiveInteger(value.width) || !isPositiveInteger(value.height)) {
    throw new Error("pet stage is invalid");
  }
}

function assertOptionalSprite(value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (
    !isRecord(value) ||
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isPositiveInteger(value.width) ||
    !isPositiveInteger(value.height)
  ) {
    throw new Error("pet sprite placement is invalid");
  }
}

function assertOptionalWorkstation(value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    throw new Error("pet workstation is invalid");
  }

  assertOptionalBox(value.monitor, "monitor");
  assertOptionalKeyboard(value.keyboard);
  assertOptionalBox(value.mouse, "mouse");
  assertOptionalAssets(value.assets);
  assertOptionalHandAnchors(value.handAnchors);
}

function assertOptionalKeyboard(value: unknown): void {
  if (value === undefined) {
    return;
  }

  assertOptionalBox(value, "keyboard");

  if (
    !isRecord(value) ||
    (value.renderMode !== undefined && value.renderMode !== "full" && value.renderMode !== "highlightOnly") ||
    !Array.isArray(value.rows) ||
    value.rows.length === 0
  ) {
    throw new Error("pet workstation keyboard rows are invalid");
  }

  for (const row of value.rows) {
    if (!isRecord(row) || !isFiniteNumber(row.y) || !isPositiveInteger(row.height) || !Array.isArray(row.keys)) {
      throw new Error("pet workstation keyboard row is invalid");
    }

    for (const key of row.keys) {
      if (
        !isRecord(key) ||
        typeof key.id !== "string" ||
        typeof key.label !== "string" ||
        !isFiniteNumber(key.x) ||
        !isPositiveInteger(key.width) ||
        (key.aliases !== undefined && (!Array.isArray(key.aliases) || !key.aliases.every((alias) => typeof alias === "string")))
      ) {
        throw new Error("pet workstation keyboard key is invalid");
      }
    }
  }
}

function assertOptionalAssets(value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    throw new Error("pet workstation assets must be an array");
  }

  for (const asset of value) {
    if (
      !isRecord(asset) ||
      typeof asset.src !== "string" ||
      !isFiniteNumber(asset.x) ||
      !isFiniteNumber(asset.y) ||
      !isPositiveInteger(asset.width) ||
      !isPositiveInteger(asset.height) ||
      (asset.layer !== undefined && asset.layer !== "back" && asset.layer !== "front")
    ) {
      throw new Error("pet workstation asset is invalid");
    }
  }
}

function assertOptionalHandAnchors(value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    throw new Error("pet workstation hand anchors are invalid");
  }

  assertOptionalPoint(value.left, "left hand anchor");
  assertOptionalPoint(value.right, "right hand anchor");
  assertOptionalPoint(value.mouse, "mouse hand anchor");
}

function assertOptionalPoint(value: unknown, name: string): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    throw new Error(`pet workstation ${name} is invalid`);
  }
}

function assertOptionalBox(value: unknown, name: string): void {
  if (value === undefined) {
    return;
  }

  if (
    !isRecord(value) ||
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isPositiveInteger(value.width) ||
    !isPositiveInteger(value.height)
  ) {
    throw new Error(`pet workstation ${name} box is invalid`);
  }
}

function derivePetName(url: string): string {
  const parts = new URL(url, window.location.href).pathname.split("/").filter(Boolean);
  return parts.at(-2) ?? "default";
}
