const DEFAULT_PREFETCH_TTL_MS = 60_000;

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const prefetchCache = new Map<string, CacheEntry>();
const inFlightPrefetch = new Map<string, Promise<unknown>>();

const isExpired = (entry: CacheEntry): boolean => entry.expiresAt <= Date.now();

export const readPrefetchCache = <T>(key: string): T | null => {
  const cached = prefetchCache.get(key);
  if (!cached) return null;
  if (isExpired(cached)) {
    prefetchCache.delete(key);
    return null;
  }
  return cached.value as T;
};

export const writePrefetchCache = <T>(
  key: string,
  value: T,
  ttlMs: number = DEFAULT_PREFETCH_TTL_MS,
): void => {
  prefetchCache.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1, ttlMs),
  });
};

export const runCachedPrefetch = async <T>(
  key: string,
  load: () => Promise<T>,
  ttlMs: number = DEFAULT_PREFETCH_TTL_MS,
): Promise<T> => {
  const cached = readPrefetchCache<T>(key);
  if (cached !== null) return cached;

  const inFlight = inFlightPrefetch.get(key) as Promise<T> | undefined;
  if (inFlight) return inFlight;

  let resolveTask: (value: T | PromiseLike<T>) => void = () => undefined;
  let rejectTask: (reason?: unknown) => void = () => undefined;
  const task = new Promise<T>((resolve, reject) => {
    resolveTask = resolve;
    rejectTask = reject;
  });
  inFlightPrefetch.set(key, task);

  void (async () => {
    try {
      const result = await load();
      writePrefetchCache(key, result, ttlMs);
      resolveTask(result);
    } catch (error) {
      rejectTask(error);
    } finally {
      inFlightPrefetch.delete(key);
    }
  })();

  return task;
};
