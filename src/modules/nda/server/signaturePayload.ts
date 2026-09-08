import { Buffer } from "node:buffer";

type NdaSignatureImageMimeType = "image/png" | "image/jpeg";

type ParsedNdaSignatureImage = {
  mime: NdaSignatureImageMimeType;
  bytes: Uint8Array;
  base64: string;
};

const DATA_URL_PREFIX_PATTERN =
  /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/i;
const BASE64_PAYLOAD_PATTERN = /^[A-Za-z0-9+/=]+$/;

export const MAX_NDA_SIGNATURE_BYTES = 1024 * 1024;
export const MAX_NDA_SIGNATURE_DATA_URL_LENGTH =
  Math.ceil((MAX_NDA_SIGNATURE_BYTES * 4) / 3) + 64;
const PNG_MAGIC_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const isValidBase64Payload = (payload: string): boolean => {
  if (!BASE64_PAYLOAD_PATTERN.test(payload)) {
    return false;
  }

  const remainder = payload.length % 4;
  if (remainder === 1) {
    return false;
  }

  if (remainder === 2 && !payload.endsWith("==")) {
    return false;
  }

  if (remainder === 3 && (payload.endsWith("==") || !payload.endsWith("="))) {
    return false;
  }

  const firstPadIndex = payload.indexOf("=");
  if (firstPadIndex !== -1 && firstPadIndex < payload.length - 2) {
    return false;
  }

  return true;
};

const hasPngMagicBytes = (bytes: Uint8Array): boolean =>
  bytes.length >= PNG_MAGIC_BYTES.length &&
  PNG_MAGIC_BYTES.every((byte, index) => bytes[index] === byte);

const hasJpegMagicBytes = (bytes: Uint8Array): boolean =>
  bytes.length >= 3 &&
  bytes[0] === 0xff &&
  bytes[1] === 0xd8 &&
  bytes[2] === 0xff;

export const parseNdaSignatureImageDataUrl = (
  signatureDataUrl: string,
): ParsedNdaSignatureImage => {
  const match = signatureDataUrl.match(DATA_URL_PREFIX_PATTERN);
  if (!match) {
    throw new Error("Invalid signature payload");
  }

  const [, mime, base64] = match;
  const trimmedBase64 = base64.trim();
  if (!trimmedBase64 || !isValidBase64Payload(trimmedBase64)) {
    throw new Error("Invalid signature payload");
  }

  const bytes = new Uint8Array(Buffer.from(trimmedBase64, "base64"));
  if (bytes.length === 0) {
    throw new Error("Invalid signature payload");
  }
  if (bytes.length > MAX_NDA_SIGNATURE_BYTES) {
    throw new Error("Invalid signature payload");
  }

  const normalizedMime = mime.toLowerCase() as NdaSignatureImageMimeType;
  const hasValidMagicBytes =
    normalizedMime === "image/png"
      ? hasPngMagicBytes(bytes)
      : hasJpegMagicBytes(bytes);
  if (!hasValidMagicBytes) {
    throw new Error("Invalid signature payload");
  }

  return {
    mime: normalizedMime,
    bytes,
    base64: trimmedBase64,
  };
};
