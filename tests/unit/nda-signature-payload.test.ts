import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_NDA_SIGNATURE_BYTES,
  parseNdaSignatureImageDataUrl,
} from "@/modules/nda/server/signaturePayload";

const buildSignatureDataUrl = (
  mime: "image/png" | "image/jpeg",
  bytes: number[],
): string => {
  const payload = new Uint8Array(bytes);
  return `data:${mime};base64,${Buffer.from(payload).toString("base64")}`;
};

test("parseNdaSignatureImageDataUrl accepts valid PNG signature payloads", () => {
  const payload = buildSignatureDataUrl(
    "image/png",
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d],
  );
  const parsed = parseNdaSignatureImageDataUrl(payload);

  assert.equal(parsed.mime, "image/png");
  assert.equal(parsed.bytes[0], 0x89);
  assert.equal(parsed.base64, payload.split(",")[1]);
});

test("parseNdaSignatureImageDataUrl accepts valid JPEG signature payloads", () => {
  const payload = buildSignatureDataUrl(
    "image/jpeg",
    [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46],
  );
  const parsed = parseNdaSignatureImageDataUrl(payload);

  assert.equal(parsed.mime, "image/jpeg");
  assert.equal(parsed.bytes[2], 0xff);
});

test("parseNdaSignatureImageDataUrl rejects empty payloads", () => {
  assert.throws(
    () => parseNdaSignatureImageDataUrl("data:image/png;base64,"),
    /Invalid signature payload/,
  );
});

test("parseNdaSignatureImageDataUrl rejects malformed data URLs", () => {
  assert.throws(
    () => parseNdaSignatureImageDataUrl("data:text/plain;base64,abcd"),
    /Invalid signature payload/,
  );
  assert.throws(
    () => parseNdaSignatureImageDataUrl("data:image/png;base64,aGVsbG8*"),
    /Invalid signature payload/,
  );
});

test("parseNdaSignatureImageDataUrl rejects wrong magic bytes", () => {
  const payload = buildSignatureDataUrl(
    "image/png",
    [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46],
  );

  assert.throws(
    () => parseNdaSignatureImageDataUrl(payload),
    /Invalid signature payload/,
  );
});

test("parseNdaSignatureImageDataUrl rejects oversized payloads", () => {
  const maxBytes = MAX_NDA_SIGNATURE_BYTES;
  const oversizedPayload = Buffer.alloc(maxBytes + 1, 0x00);
  const dataUrl = `data:image/png;base64,${oversizedPayload.toString("base64")}`;

  assert.throws(
    () => parseNdaSignatureImageDataUrl(dataUrl),
    /Invalid signature payload/,
  );
});

test("parseNdaSignatureImageDataUrl rejects jpeg payload with invalid magic bytes", () => {
  const payload = buildSignatureDataUrl(
    "image/jpeg",
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d],
  );

  assert.throws(
    () => parseNdaSignatureImageDataUrl(payload),
    /Invalid signature payload/,
  );
});
