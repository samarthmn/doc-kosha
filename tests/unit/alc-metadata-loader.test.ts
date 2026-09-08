import assert from "node:assert/strict";
import test from "node:test";

import {
  collectPaginatedAlcMetadata,
  createLatestAlcMetadataLoadCoordinator,
  getAlcReviewMetadataState,
  loadCompleteAlcContentMetadata,
} from "@/modules/public-links";

type MetadataRow = { id: string };

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

const createDeferred = <T>(): Deferred<T> => {
  let resolvePromise: ((value: T) => void) | null = null;
  let rejectPromise: ((reason: unknown) => void) | null = null;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: (value) => {
      assert.ok(resolvePromise);
      resolvePromise(value);
    },
    reject: (reason) => {
      assert.ok(rejectPromise);
      rejectPromise(reason);
    },
  };
};

const rowId = (index: number): string =>
  `row-${String(index).padStart(4, "0")}`;

test("ALC metadata pagination collects all 1,205 rows in stable order under a lower server cap", async () => {
  const rows = Array.from({ length: 1_205 }, (_, index) => ({
    id: rowId(index),
  }));
  const calls: Array<{ from: number; to: number; signal: AbortSignal }> = [];
  const controller = new AbortController();

  const result = await collectPaginatedAlcMetadata<MetadataRow>({
    signal: controller.signal,
    fetchPage: async ({ from, to, signal }) => {
      calls.push({ from, to, signal });
      const serverCappedEnd = Math.min(to + 1, from + 400);
      return { rows: rows.slice(from, serverCappedEnd), error: null };
    },
  });

  assert.deepEqual(
    calls.map(({ from, to }) => [from, to]),
    [
      [0, 999],
      [400, 1_399],
      [800, 1_799],
      [1_200, 2_199],
      [1_205, 2_204],
    ],
  );
  assert.ok(calls.every(({ signal }) => signal === controller.signal));
  assert.equal(result.length, 1_205);
  assert.deepEqual(
    result.map(({ id }) => id),
    rows.map(({ id }) => id),
  );
});

test("ALC metadata pagination proves completion with an empty page at exact boundaries", async () => {
  const collect = async (count: number) => {
    const rows = Array.from({ length: count }, (_, index) => ({
      id: rowId(index),
    }));
    const calls: Array<[number, number]> = [];
    const result = await collectPaginatedAlcMetadata<MetadataRow>({
      signal: new AbortController().signal,
      fetchPage: async ({ from, to }) => {
        calls.push([from, to]);
        return { rows: rows.slice(from, to + 1), error: null };
      },
    });
    return { calls, result };
  };

  const exactLimit = await collect(1_000);
  assert.deepEqual(exactLimit.calls, [
    [0, 999],
    [1_000, 1_999],
  ]);
  assert.equal(exactLimit.result.length, 1_000);

  const overLimit = await collect(1_001);
  assert.deepEqual(overLimit.calls, [
    [0, 999],
    [1_000, 1_999],
    [1_001, 2_000],
  ]);
  assert.equal(overLimit.result.at(-1)?.id, "row-1000");
});

test("paired ALC metadata commits only after both complete collections include late review targets", async () => {
  const folderRows = Array.from({ length: 1_205 }, (_, index) => ({
    id: `folder-${String(index).padStart(4, "0")}`,
  }));
  const documentGate = createDeferred<void>();
  let resolved = false;

  const pending = loadCompleteAlcContentMetadata({
    signal: new AbortController().signal,
    fetchFolderPage: async ({ from, to }) => ({
      rows: folderRows.slice(from, to + 1),
      error: null,
    }),
    fetchDocumentPage: async ({ from, to }) => {
      if (from === 0) await documentGate.promise;
      const rows = [{ id: "document-only" }].slice(from, to + 1);
      return { rows, error: null };
    },
  }).then((value) => {
    resolved = true;
    return value;
  });

  await Promise.resolve();
  assert.equal(
    resolved,
    false,
    "folder success must not publish before documents are complete",
  );
  documentGate.resolve(undefined);
  const metadata = await pending;

  assert.equal(metadata.folders.length, 1_205);
  assert.deepEqual(metadata.documents, [{ id: "document-only" }]);
  assert.deepEqual(
    getAlcReviewMetadataState(
      [
        {
          key: "email:late@example.com",
          kind: "email",
          displayValue: "late@example.com",
          targets: [
            { scope: "folder", targetId: "folder-1204" },
            { scope: "document", targetId: "document-only" },
          ],
        },
      ],
      {
        isLoading: false,
        error: null,
        folderLabels: new Map(
          metadata.folders.map((row) => [row.id, `Label ${row.id}`]),
        ),
        documentLabels: new Map([["document-only", "Document only"]]),
      },
    ),
    { status: "ready", unresolvedTargets: [] },
  );
});

test("a failed paired metadata branch aborts its still-pending sibling crawler", async () => {
  const parentController = new AbortController();
  const folderFailure = new Error("folder metadata unavailable");
  const folderSignals: AbortSignal[] = [];
  const documentSignals: AbortSignal[] = [];
  let resolveSiblingAbort: (() => void) | null = null;
  const siblingAborted = new Promise<void>((resolve) => {
    resolveSiblingAbort = resolve;
  });

  await assert.rejects(
    loadCompleteAlcContentMetadata({
      signal: parentController.signal,
      fetchFolderPage: async ({ signal }) => {
        folderSignals.push(signal);
        return { rows: null, error: folderFailure };
      },
      fetchDocumentPage: async ({ signal }) => {
        documentSignals.push(signal);
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              resolveSiblingAbort?.();
              resolve();
            },
            { once: true },
          );
        });
        return { rows: null, error: new Error("sibling aborted") };
      },
    }),
    (error) => error === folderFailure,
  );

  await siblingAborted;
  assert.strictEqual(folderSignals[0], documentSignals[0]);
  assert.equal(documentSignals[0]?.aborted, true);
  assert.equal(parentController.signal.aborted, false);
});

test("ALC metadata pagination propagates one abort signal and never classifies an aborted response as a load error", async () => {
  const controller = new AbortController();
  let calls = 0;

  await assert.rejects(
    collectPaginatedAlcMetadata<MetadataRow>({
      signal: controller.signal,
      fetchPage: async () => {
        calls += 1;
        controller.abort();
        return {
          rows: [],
          error: new Error("PostgREST abort response"),
        };
      },
    }),
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(calls, 1);

  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  await assert.rejects(
    collectPaginatedAlcMetadata<MetadataRow>({
      signal: alreadyAborted.signal,
      fetchPage: async () => {
        assert.fail("an already-aborted collection must not query a page");
      },
    }),
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );
});

test("a newer ALC metadata load aborts and generation-gates stale success and finalization", async () => {
  const coordinator = createLatestAlcMetadataLoadCoordinator();
  const first = createDeferred<readonly string[]>();
  const second = createDeferred<readonly string[]>();
  const events: string[] = [];
  const firstSignals: AbortSignal[] = [];

  const firstRun = coordinator.run({
    load: (signal) => {
      firstSignals.push(signal);
      return first.promise;
    },
    onStart: () => events.push("start:first"),
    onSuccess: () => events.push("success:first"),
    onError: () => events.push("error:first"),
    onSettled: () => events.push("settled:first"),
  });
  const secondRun = coordinator.run({
    load: () => second.promise,
    onStart: () => events.push("start:second"),
    onSuccess: (value) => events.push(`success:${value.join(",")}`),
    onError: () => events.push("error:second"),
    onSettled: () => events.push("settled:second"),
  });

  assert.equal(firstSignals[0]?.aborted, true);
  first.resolve(["stale"]);
  second.resolve(["current"]);
  await Promise.all([firstRun, secondRun]);

  assert.deepEqual(events, [
    "start:first",
    "start:second",
    "success:current",
    "settled:second",
  ]);
});

test("retry and cleanup silence stale errors without clearing the current loading state", async () => {
  const coordinator = createLatestAlcMetadataLoadCoordinator();
  const staleFailure = createDeferred<string>();
  const currentFailure = createDeferred<string>();
  const events: string[] = [];
  const staleSignals: AbortSignal[] = [];
  const currentSignals: AbortSignal[] = [];

  const staleRun = coordinator.run({
    load: (signal) => {
      staleSignals.push(signal);
      return staleFailure.promise;
    },
    onStart: () => events.push("start:stale"),
    onSuccess: () => events.push("success:stale"),
    onError: () => events.push("error:stale"),
    onSettled: () => events.push("settled:stale"),
  });
  const currentRun = coordinator.run({
    load: (signal) => {
      currentSignals.push(signal);
      return currentFailure.promise;
    },
    onStart: () => events.push("start:current"),
    onSuccess: () => events.push("success:current"),
    onError: (error) =>
      events.push(
        `error:${error instanceof Error ? error.message : "unknown"}`,
      ),
    onSettled: () => events.push("settled:current"),
  });

  assert.equal(staleSignals[0]?.aborted, true);
  staleFailure.reject(new Error("stale outage"));
  currentFailure.reject(new Error("current outage"));
  await Promise.all([staleRun, currentRun]);
  assert.deepEqual(events, [
    "start:stale",
    "start:current",
    "error:current outage",
    "settled:current",
  ]);

  const strictModeReplay = createDeferred<string>();
  const replayRun = coordinator.run({
    load: (signal) => {
      currentSignals.push(signal);
      return strictModeReplay.promise;
    },
    onStart: () => events.push("start:replay"),
    onSuccess: () => events.push("success:replay"),
    onError: () => events.push("error:replay"),
    onSettled: () => events.push("settled:replay"),
  });
  coordinator.cancel();
  assert.equal(currentSignals.at(-1)?.aborted, true);
  strictModeReplay.reject(new Error("cleanup abort response"));
  await replayRun;
  assert.deepEqual(events.slice(-1), ["start:replay"]);
});
