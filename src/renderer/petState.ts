export const petStates = ["idle", "working", "waiting", "failed", "review", "dragging"] as const;

export type PetState = (typeof petStates)[number];
export type BehaviorMode = "auto" | "manual";

export interface PetStateSnapshot {
  mode: BehaviorMode;
  manualState: PetState;
  automaticState: PetState;
  baseState: PetState;
  activeState: PetState;
  temporaryState: PetState | null;
}

export interface PetStateController {
  snapshot(): PetStateSnapshot;
  setMode(mode: BehaviorMode): PetStateSnapshot;
  setManualState(state: PetState): PetStateSnapshot;
  refreshAutomaticState(): PetStateSnapshot;
  beginTemporaryState(state: PetState): number;
  endTemporaryState(token: number): PetStateSnapshot;
}

interface PetStateControllerOptions {
  mode: BehaviorMode;
  state: PetState;
  inferAutomaticState: () => PetState;
  onStateChange: (snapshot: PetStateSnapshot) => void;
}

export function createPetStateController(options: PetStateControllerOptions): PetStateController {
  let mode = options.mode;
  let manualState = options.state;
  let automaticState = safeInferAutomaticState(options.inferAutomaticState);
  let temporaryState: PetState | null = null;
  let temporaryToken = 0;
  let activeState = resolveActiveState();

  function snapshot(): PetStateSnapshot {
    const baseState = mode === "auto" ? automaticState : manualState;

    return {
      mode,
      manualState,
      automaticState,
      baseState,
      activeState,
      temporaryState,
    };
  }

  function apply(): PetStateSnapshot {
    const nextState = resolveActiveState();
    activeState = nextState;
    const nextSnapshot = snapshot();
    options.onStateChange(nextSnapshot);
    return nextSnapshot;
  }

  function resolveActiveState(): PetState {
    if (temporaryState) {
      return temporaryState;
    }

    return mode === "auto" ? automaticState : manualState;
  }

  return {
    snapshot,
    setMode(nextMode) {
      mode = nextMode;
      if (mode === "auto") {
        automaticState = safeInferAutomaticState(options.inferAutomaticState);
      }
      return apply();
    },
    setManualState(state) {
      manualState = state;
      return apply();
    },
    refreshAutomaticState() {
      automaticState = safeInferAutomaticState(options.inferAutomaticState);
      return apply();
    },
    beginTemporaryState(state) {
      temporaryToken += 1;
      temporaryState = state;
      apply();
      return temporaryToken;
    },
    endTemporaryState(token) {
      if (token === temporaryToken) {
        temporaryState = null;
      }

      return apply();
    },
  };
}

export function toBehaviorMode(value: string | null | undefined): BehaviorMode {
  return value === "manual" ? "manual" : "auto";
}

export function toPetState(value: string | null | undefined, fallback: PetState = "idle"): PetState {
  return value && isPetState(value) ? value : fallback;
}

export function isPetState(value: string): value is PetState {
  return petStates.includes(value as PetState);
}

function safeInferAutomaticState(inferAutomaticState: () => PetState): PetState {
  try {
    return inferAutomaticState();
  } catch (error) {
    console.error("[koda-desk] failed to infer automatic pet state", error);
    return "idle";
  }
}
