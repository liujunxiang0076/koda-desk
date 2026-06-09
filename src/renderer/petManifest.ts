export interface PetManifest {
  name: string;
  displayName: string;
  description: string;
  version: string;
  spritesheet: string;
  frame: {
    width: number;
    height: number;
    columns: number;
    rows: number;
  };
  animations: Record<
    string,
    {
      frames: number[];
      fps: number;
      loop: boolean;
    }
  >;
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
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function derivePetName(url: string): string {
  const parts = new URL(url, window.location.href).pathname.split("/").filter(Boolean);
  return parts.at(-2) ?? "default";
}
