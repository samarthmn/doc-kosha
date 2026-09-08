import { clientEnv } from "@/lib/env";
import { processLifecycleEmailJobs } from "./service";

const PLAYWRIGHT_LOCAL_POLL_MS = 1_000;
const DEFAULT_LOCAL_POLL_MS = 5_000;

type LifecycleProcessorState = {
  inFlight: boolean;
  pollIntervalMs: number;
  run: (() => void) | null;
  started: boolean;
  timer: NodeJS.Timeout | null;
};

type GlobalWithLifecycleProcessor = typeof globalThis & {
  __dockoshaLifecycleProcessor?: LifecycleProcessorState;
};

type LifecycleProcessorJobScope = {
  includeBackfills: boolean;
  includeInactiveSweep: boolean;
};

export const resolveLocalLifecycleProcessorJobScope = (
  playwright = process.env.PLAYWRIGHT,
): LifecycleProcessorJobScope => {
  const includeHistoricalScans = playwright !== "true";
  return {
    includeBackfills: includeHistoricalScans,
    includeInactiveSweep: includeHistoricalScans,
  };
};

const getLocalPollIntervalMs = (): number =>
  process.env.PLAYWRIGHT === "true"
    ? PLAYWRIGHT_LOCAL_POLL_MS
    : DEFAULT_LOCAL_POLL_MS;

export const startLocalLifecycleEmailProcessor = (): void => {
  if (clientEnv.NEXT_PUBLIC_APP_ENV !== "local") {
    return;
  }

  const globalWithProcessor = globalThis as GlobalWithLifecycleProcessor;
  const existingState = globalWithProcessor.__dockoshaLifecycleProcessor;
  const pollIntervalMs = getLocalPollIntervalMs();

  const state: LifecycleProcessorState = existingState ?? {
    inFlight: false,
    pollIntervalMs,
    run: null,
    started: true,
    timer: null,
  };

  const tick = async (): Promise<void> => {
    if (state.inFlight) {
      return;
    }

    state.inFlight = true;
    try {
      const result = await processLifecycleEmailJobs(
        resolveLocalLifecycleProcessorJobScope(),
      );

      if (result.processed > 0 || result.sent > 0 || result.failed > 0) {
        console.info("[lifecycle-email] local processor tick", result);
      }
    } catch (error) {
      console.error("[lifecycle-email] local processor tick failed", error);
    } finally {
      state.inFlight = false;
    }
  };

  state.run = () => {
    void tick();
  };

  if (existingState?.started) {
    if (state.pollIntervalMs !== pollIntervalMs && state.timer) {
      clearInterval(state.timer);
      state.timer = setInterval(() => {
        state.run?.();
      }, pollIntervalMs);

      if (typeof state.timer.unref === "function") {
        state.timer.unref();
      }

      state.pollIntervalMs = pollIntervalMs;
    }

    globalWithProcessor.__dockoshaLifecycleProcessor = state;
    state.run();
    return;
  }

  const timer = setInterval(() => {
    state.run?.();
  }, pollIntervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  state.pollIntervalMs = pollIntervalMs;
  state.started = true;
  state.timer = timer;
  globalWithProcessor.__dockoshaLifecycleProcessor = state;

  state.run();
};
