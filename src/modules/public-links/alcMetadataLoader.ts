const DEFAULT_ALC_METADATA_PAGE_SIZE = 1_000;

type AlcMetadataPage<T> = {
  rows: readonly T[] | null;
  error: unknown | null;
};

type AlcMetadataPageRequest = {
  from: number;
  to: number;
  signal: AbortSignal;
};

type CollectPaginatedAlcMetadataArgs<T> = {
  signal: AbortSignal;
  fetchPage: (request: AlcMetadataPageRequest) => Promise<AlcMetadataPage<T>>;
  pageSize?: number;
};

type LoadCompleteAlcContentMetadataArgs<TFolder, TDocument> = {
  signal: AbortSignal;
  fetchFolderPage: (
    request: AlcMetadataPageRequest,
  ) => Promise<AlcMetadataPage<TFolder>>;
  fetchDocumentPage: (
    request: AlcMetadataPageRequest,
  ) => Promise<AlcMetadataPage<TDocument>>;
  pageSize?: number;
};

/**
 * Reads a complete, stably ordered metadata collection. Completion is proven
 * by an empty page rather than a short page because PostgREST may apply a
 * server-side cap smaller than the requested range.
 */
export const collectPaginatedAlcMetadata = async <T>({
  signal,
  fetchPage,
  pageSize = DEFAULT_ALC_METADATA_PAGE_SIZE,
}: CollectPaginatedAlcMetadataArgs<T>): Promise<T[]> => {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("ALC metadata page size must be a positive integer");
  }

  const rows: T[] = [];
  let from = 0;

  while (true) {
    signal.throwIfAborted();
    const page = await fetchPage({
      from,
      to: from + pageSize - 1,
      signal,
    });
    // Supabase resolves an aborted PostgREST request with an error response.
    // Preserve abort semantics before inspecting that error so cancellation is
    // silent and cannot become visible metadata failure UI.
    signal.throwIfAborted();
    if (page.error) throw page.error;

    const pageRows = page.rows ?? [];
    if (pageRows.length === 0) return rows;

    rows.push(...pageRows);
    from += pageRows.length;
  }
};

/** Collects both metadata domains before exposing either one to the caller. */
export const loadCompleteAlcContentMetadata = async <TFolder, TDocument>({
  signal,
  fetchFolderPage,
  fetchDocumentPage,
  pageSize,
}: LoadCompleteAlcContentMetadataArgs<TFolder, TDocument>): Promise<{
  folders: TFolder[];
  documents: TDocument[];
}> => {
  signal.throwIfAborted();
  const pairedController = new AbortController();
  const abortPairedLoad = (): void => pairedController.abort();
  signal.addEventListener("abort", abortPairedLoad, { once: true });

  try {
    const [folders, documents] = await Promise.all([
      collectPaginatedAlcMetadata({
        signal: pairedController.signal,
        fetchPage: fetchFolderPage,
        pageSize,
      }),
      collectPaginatedAlcMetadata({
        signal: pairedController.signal,
        fetchPage: fetchDocumentPage,
        pageSize,
      }),
    ]);
    return { folders, documents };
  } catch (error) {
    // Promise.all rejects as soon as either crawler fails. Stop its sibling
    // before this paired operation becomes unreachable to the coordinator.
    pairedController.abort();
    throw error;
  } finally {
    signal.removeEventListener("abort", abortPairedLoad);
  }
};

type LatestAlcMetadataLoadArgs<T> = {
  load: (signal: AbortSignal) => Promise<T>;
  onStart: () => void;
  onSuccess: (value: T) => void;
  onError: (error: unknown) => void;
  onSettled: () => void;
};

type LatestAlcMetadataLoadCoordinator = {
  run: <T>(args: LatestAlcMetadataLoadArgs<T>) => Promise<void>;
  cancel: () => void;
};

/**
 * Owns one logical folder+document load at a time. Every callback that can
 * write React state is generation-gated, including the final loading clear.
 */
export const createLatestAlcMetadataLoadCoordinator =
  (): LatestAlcMetadataLoadCoordinator => {
    let generation = 0;
    let activeController: AbortController | null = null;

    const cancel = (): void => {
      generation += 1;
      activeController?.abort();
      activeController = null;
    };

    const run = async <T>({
      load,
      onStart,
      onSuccess,
      onError,
      onSettled,
    }: LatestAlcMetadataLoadArgs<T>): Promise<void> => {
      const previousController = activeController;
      const requestGeneration = generation + 1;
      generation = requestGeneration;
      previousController?.abort();

      const controller = new AbortController();
      activeController = controller;
      const isCurrent = (): boolean =>
        generation === requestGeneration &&
        activeController === controller &&
        !controller.signal.aborted;

      onStart();
      try {
        const value = await load(controller.signal);
        if (!isCurrent()) return;
        onSuccess(value);
      } catch (error) {
        if (!isCurrent()) return;
        onError(error);
      } finally {
        if (isCurrent()) {
          activeController = null;
          onSettled();
        }
      }
    };

    return { run, cancel };
  };
