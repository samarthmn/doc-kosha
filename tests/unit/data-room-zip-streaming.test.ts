import assert from "node:assert/strict";
import { randomFillSync } from "node:crypto";
import { access, readdir } from "node:fs/promises";
import test from "node:test";

import { unzipSync } from "fflate";

import {
  DATA_ROOM_ZIP_MAX_INPUT_BYTES,
  DATA_ROOM_ZIP_MAX_STAGED_TRANSFORM_BYTES,
} from "@/lib/constants";
import {
  createStreamingZip,
  createZipTempWorkspace,
  type StreamingZipEntry,
} from "@/server/dataRoomZip";
import { createEngineFailure } from "@/server/engineErrors";

const collectStream = async (
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const reader = stream.getReader();

  while (true) {
    const result = await reader.read();
    if (result.done) break;
    const chunk = result.value;
    chunks.push(chunk);
    totalBytes += chunk.byteLength;
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
};

test("streaming ZIP opens one source at a time and produces a valid archive", async () => {
  let activeSources = 0;
  let peakActiveSources = 0;
  const closed: string[] = [];

  const entry = (zipPath: string, text: string): StreamingZipEntry => ({
    zipPath,
    open: async () => {
      activeSources += 1;
      peakActiveSources = Math.max(peakActiveSources, activeSources);
      return {
        chunks: (async function* () {
          yield new TextEncoder().encode(text.slice(0, 2));
          yield new TextEncoder().encode(text.slice(2));
        })(),
        close: async () => {
          activeSources -= 1;
          closed.push(zipPath);
        },
      };
    },
  });

  const archive = createStreamingZip(
    [entry("first.txt", "first"), entry("nested/second.txt", "second")],
    { maxUncompressedBytes: 1024 },
  );
  const bytes = await collectStream(archive.stream);
  const completion = await archive.completion;
  const files = unzipSync(bytes);

  assert.equal(new TextDecoder().decode(files["first.txt"]), "first");
  assert.equal(new TextDecoder().decode(files["nested/second.txt"]), "second");
  assert.equal(peakActiveSources, 1);
  assert.deepEqual(closed, ["first.txt", "nested/second.txt"]);
  assert.equal(completion.sourceBytes, 11);
  assert.equal(completion.archiveBytes, bytes.byteLength);
});

test("streaming ZIP closes the active source when the consumer cancels", async () => {
  let closed = false;
  let observedAbort = false;

  const archive = createStreamingZip(
    [
      {
        zipPath: "large.bin",
        open: async (signal) => ({
          chunks: (async function* () {
            yield new Uint8Array(64 * 1024);
            await new Promise<void>((resolve) => {
              if (signal.aborted) {
                observedAbort = true;
                resolve();
                return;
              }
              signal.addEventListener(
                "abort",
                () => {
                  observedAbort = true;
                  resolve();
                },
                { once: true },
              );
            });
            if (!signal.aborted) yield new Uint8Array(64 * 1024);
          })(),
          close: async () => {
            closed = true;
          },
        }),
      },
    ],
    { maxUncompressedBytes: 1024 * 1024 },
  );

  const reader = archive.stream.getReader();
  const first = await reader.read();
  assert.equal(first.done, false);
  await reader.cancel("client disconnected");

  await assert.rejects(archive.completion);
  assert.equal(observedAbort, true);
  assert.equal(closed, true);
});

test("streaming ZIP aborts archive construction at the operation deadline", async () => {
  const controller = new AbortController();
  let closed = false;
  const archive = createStreamingZip(
    [
      {
        zipPath: "deadline.bin",
        open: async (signal) => ({
          chunks: (async function* () {
            yield new Uint8Array(64 * 1024);
            await new Promise<void>((resolve) => {
              if (signal.aborted) {
                resolve();
                return;
              }
              signal.addEventListener("abort", () => resolve(), { once: true });
            });
          })(),
          close: async () => {
            closed = true;
          },
        }),
      },
    ],
    { maxUncompressedBytes: 1024 * 1024, signal: controller.signal },
  );
  const reader = archive.stream.getReader();
  await reader.read();
  controller.abort(
    createEngineFailure({
      code: "deadline_exceeded",
      message: "deadline exceeded",
      operation: "conversion",
      format: "zip",
    }),
  );

  await assert.rejects(archive.completion, (error: unknown) => {
    assert.equal(typeof error, "object");
    assert.ok(error);
    assert.equal(Reflect.get(error, "code"), "deadline_exceeded");
    assert.match(String(Reflect.get(error, "message")), /deadline exceeded/);
    return true;
  });
  assert.equal(closed, true);
});

test("streaming ZIP rejects input that crosses the uncompressed byte limit", async () => {
  let closed = false;
  const archive = createStreamingZip(
    [
      {
        zipPath: "oversized.bin",
        open: async () => ({
          chunks: (async function* () {
            yield new Uint8Array(6);
            yield new Uint8Array(5);
          })(),
          close: async () => {
            closed = true;
          },
        }),
      },
    ],
    { maxUncompressedBytes: 10 },
  );

  await assert.rejects(collectStream(archive.stream), /exceed.*10/i);
  await assert.rejects(archive.completion, /exceed.*10/i);
  assert.equal(closed, true);
});

test("streaming ZIP backpressures an unread response instead of draining its source", async () => {
  const totalChunks = 128;
  let producedChunks = 0;
  let closed = false;
  const archive = createStreamingZip(
    [
      {
        zipPath: "incompressible.bin",
        open: async () => ({
          chunks: (async function* () {
            for (let index = 0; index < totalChunks; index += 1) {
              const chunk = new Uint8Array(64 * 1024);
              randomFillSync(chunk);
              producedChunks += 1;
              yield chunk;
            }
          })(),
          close: async () => {
            closed = true;
          },
        }),
      },
    ],
    { maxUncompressedBytes: totalChunks * 64 * 1024 },
  );

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.ok(
    producedChunks < totalChunks,
    `producer drained all ${producedChunks} chunks without a consumer`,
  );

  const reader = archive.stream.getReader();
  await reader.cancel("test complete");
  await assert.rejects(archive.completion);
  assert.equal(closed, true);
});

test("streaming ZIP completion settles when the central directory write is backpressured", async () => {
  // A >64KiB central directory is written as one final chunk immediately
  // before end(); a slow consumer keeps the writable buffered at that moment,
  // and 'drain' never fires after end() — completion must not wait for it.
  const entries: StreamingZipEntry[] = Array.from(
    { length: 500 },
    (_, index) => ({
      zipPath: `nested/${"segment-".repeat(12)}${String(index).padStart(4, "0")}.txt`,
      open: async () => ({
        chunks: (async function* () {
          yield new TextEncoder().encode("x");
        })(),
      }),
    }),
  );

  const archive = createStreamingZip(entries, {
    maxUncompressedBytes: entries.length,
  });

  const reader = archive.stream.getReader();
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  let guard: ReturnType<typeof setTimeout> | undefined;
  try {
    const completion = await Promise.race([
      archive.completion,
      new Promise<never>((_, reject) => {
        guard = setTimeout(
          () => reject(new Error("completion never settled")),
          5_000,
        );
      }),
    ]);
    assert.ok(completion.archiveBytes > 64 * 1024);
    assert.equal(completion.sourceBytes, entries.length);
  } finally {
    clearTimeout(guard);
  }
});

test("temporary ZIP workspace removes staged transforms after cancellation", async () => {
  const workspace = await createZipTempWorkspace();
  const staged = await workspace.stageBuffer(
    "watermarked.pdf",
    randomFillSync(new Uint8Array(256 * 1024)),
  );
  await access(workspace.directoryPath);

  const archive = createStreamingZip([staged.entry], {
    maxUncompressedBytes: staged.byteLength,
  });
  const reader = archive.stream.getReader();
  await reader.read();
  await reader.cancel("client disconnected");
  await assert.rejects(archive.completion);
  await workspace.cleanup();
  await workspace.cleanup();

  await assert.rejects(access(workspace.directoryPath));
});

test("temporary ZIP workspace enforces its disk budget before writing", async () => {
  assert.equal(DATA_ROOM_ZIP_MAX_INPUT_BYTES, 500 * 1024 * 1024);
  assert.equal(DATA_ROOM_ZIP_MAX_STAGED_TRANSFORM_BYTES, 450 * 1024 * 1024);
  const workspace = await createZipTempWorkspace({ maxStagedBytes: 10 });
  try {
    await workspace.stageBuffer("first.pdf", new Uint8Array(6));
    await assert.rejects(
      workspace.stageBuffer("second.pdf", new Uint8Array(5)),
      /temporary.*10 byte/i,
    );
    assert.equal((await readdir(workspace.directoryPath)).length, 1);
  } finally {
    await workspace.cleanup();
  }
});
