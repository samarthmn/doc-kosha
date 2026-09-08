import assert from "node:assert/strict";
import test from "node:test";

import { createBoundedObjectAccess } from "@/server/storage/boundedObject";
import type { ObjectStreamResult } from "@/server/storage/r2Stream";

const bucket = "data-room" as const;

test("bounded download rejects an oversized HEAD before issuing GET", async () => {
  let getCalls = 0;
  const access = createBoundedObjectAccess({
    headObject: async () => ({ ok: true, contentLength: 11 }),
    downloadToBuffer: async () => {
      getCalls += 1;
      return { ok: true, buffer: Buffer.alloc(0) };
    },
    downloadObjectStream: async () => {
      throw new Error("probe should not run");
    },
  });

  const result = await access.downloadToBufferBounded({
    logicalBucket: bucket,
    path: "oversized.bin",
    maxBytes: 10,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 413);
  assert.equal(getCalls, 0);
});

test("unknown HEAD length uses a one-byte range probe and closes it", async () => {
  let requestedRange: string | undefined;
  let closed = false;
  const probe: ObjectStreamResult = {
    ok: true,
    chunks: (async function* () {
      yield Uint8Array.of(1);
    })(),
    contentLength: 1,
    contentRange: "bytes 0-0/321",
    close: async () => {
      closed = true;
    },
  };
  const access = createBoundedObjectAccess({
    headObject: async () => ({ ok: true }),
    downloadToBuffer: async () => ({
      ok: true,
      buffer: Buffer.alloc(0),
    }),
    downloadObjectStream: async (options) => {
      requestedRange = options.range;
      return probe;
    },
  });

  const result = await access.getObjectByteLength({
    logicalBucket: bucket,
    path: "unknown.bin",
  });

  assert.deepEqual(result, { ok: true, byteLength: 321 });
  assert.equal(requestedRange, "bytes=0-0");
  assert.equal(closed, true);
});

test("bounded download uses max plus one range and rejects source growth", async () => {
  let requestedRange: string | undefined;
  const access = createBoundedObjectAccess({
    headObject: async () => ({ ok: true, contentLength: 10 }),
    downloadToBuffer: async (options) => {
      requestedRange = options.range;
      return { ok: true, buffer: Buffer.alloc(11) };
    },
    downloadObjectStream: async () => {
      throw new Error("probe should not run");
    },
  });

  const result = await access.downloadToBufferBounded({
    logicalBucket: bucket,
    path: "changed.bin",
    maxBytes: 10,
  });

  assert.equal(requestedRange, "bytes=0-10");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 413);
});

test("exact object stream closes transport when the consumer stops early", async () => {
  let closed = false;
  let requestedRange: string | undefined;
  const access = createBoundedObjectAccess({
    headObject: async () => ({ ok: true, contentLength: 4 }),
    downloadToBuffer: async () => ({
      ok: true,
      buffer: Buffer.alloc(0),
    }),
    downloadObjectStream: async (options) => {
      requestedRange = options.range;
      return {
        ok: true,
        chunks: (async function* () {
          yield Uint8Array.of(1, 2);
          yield Uint8Array.of(3, 4);
        })(),
        close: async () => {
          closed = true;
        },
      };
    },
  });

  const result = await access.openExactObjectStream({
    logicalBucket: bucket,
    path: "four.bin",
    expectedBytes: 4,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  for await (const chunk of result.chunks) {
    assert.deepEqual(chunk, Uint8Array.of(1, 2));
    break;
  }

  assert.equal(requestedRange, "bytes=0-4");
  assert.equal(closed, true);
});

test("zero-byte objects return empty bounded readers without a range GET", async () => {
  let bufferGets = 0;
  let streamGets = 0;
  const access = createBoundedObjectAccess({
    headObject: async () => ({ ok: true, contentLength: 0 }),
    downloadToBuffer: async () => {
      bufferGets += 1;
      return { ok: true, buffer: Buffer.alloc(0) };
    },
    downloadObjectStream: async () => {
      streamGets += 1;
      return {
        ok: true,
        chunks: (async function* () {
          yield new Uint8Array();
        })(),
        close: async () => undefined,
      };
    },
  });

  const buffered = await access.downloadToBufferBounded({
    logicalBucket: bucket,
    path: "empty.bin",
    maxBytes: 10,
  });
  assert.equal(buffered.ok, true);
  if (buffered.ok) assert.equal(buffered.buffer.byteLength, 0);

  const streamed = await access.openExactObjectStream({
    logicalBucket: bucket,
    path: "empty.bin",
    expectedBytes: 0,
  });
  assert.equal(streamed.ok, true);
  if (streamed.ok) {
    let observed = 0;
    for await (const chunk of streamed.chunks) observed += chunk.byteLength;
    assert.equal(observed, 0);
  }

  assert.equal(bufferGets, 0);
  assert.equal(streamGets, 0);
});

test("exact object stream rejects a max-plus-one source change and closes", async () => {
  let closed = false;
  const access = createBoundedObjectAccess({
    headObject: async () => ({ ok: true, contentLength: 4 }),
    downloadToBuffer: async () => ({
      ok: true,
      buffer: Buffer.alloc(0),
    }),
    downloadObjectStream: async () => ({
      ok: true,
      chunks: (async function* () {
        yield Uint8Array.of(1, 2, 3, 4, 5);
      })(),
      close: async () => {
        closed = true;
      },
    }),
  });
  const result = await access.openExactObjectStream({
    logicalBucket: bucket,
    path: "changed.bin",
    expectedBytes: 4,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const iterator = result.chunks[Symbol.asyncIterator]();
  await assert.rejects(iterator.next(), /grew after ZIP preflight/);
  assert.equal(closed, true);
});
