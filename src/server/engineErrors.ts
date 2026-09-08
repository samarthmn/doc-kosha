import {
  PROVIDER_ERROR_CODES,
  PROVIDER_OPERATIONS,
  type ProviderFailure,
} from "@dockosha/provider-interface";
import { z } from "zod";

export const ENGINE_ERROR_CODES = PROVIDER_ERROR_CODES;

export const engineErrorCodeSchema = z.enum(ENGINE_ERROR_CODES);
export type EngineErrorCode = z.infer<typeof engineErrorCodeSchema>;

export const ENGINE_OPERATIONS = PROVIDER_OPERATIONS;

export const engineOperationSchema = z.enum(ENGINE_OPERATIONS);
export type EngineOperation = z.infer<typeof engineOperationSchema>;

const RETRYABLE_CODES: ReadonlySet<EngineErrorCode> = new Set([
  "deadline_exceeded",
  "queue_busy",
  "worker_boot_failed",
  "engine_unavailable",
  "trap",
]);

const ENGINE_DETAIL_MAX_DEPTH = 5;
const ENGINE_DETAIL_MAX_ITEMS = 32;
const ENGINE_DETAIL_MAX_KEY_LENGTH = 128;
const ENGINE_DETAIL_MAX_STRING_LENGTH = 2_048;

type EngineErrorContext =
  | null
  | boolean
  | number
  | string
  | EngineErrorContext[]
  | { [key: string]: EngineErrorContext };

type EngineErrorDetail =
  | string
  | {
      reason?: string;
      context?: EngineErrorContext;
      [key: string]: unknown;
    };

const boundedString = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, ENGINE_DETAIL_MAX_STRING_LENGTH);
};

const boundedContext = (
  value: unknown,
  depth: number,
  ancestors: ReadonlySet<object>,
): EngineErrorContext | undefined => {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return boundedString(value);
  if (depth >= ENGINE_DETAIL_MAX_DEPTH || typeof value !== "object") {
    return undefined;
  }
  if (ancestors.has(value)) return undefined;

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, ENGINE_DETAIL_MAX_ITEMS).flatMap((item) => {
      const bounded = boundedContext(item, depth + 1, nextAncestors);
      return bounded === undefined ? [] : [bounded];
    });
  }

  const result: { [key: string]: EngineErrorContext } = {};
  for (const [rawKey, item] of Object.entries(value).slice(
    0,
    ENGINE_DETAIL_MAX_ITEMS,
  )) {
    const key = rawKey.slice(0, ENGINE_DETAIL_MAX_KEY_LENGTH);
    if (!key) continue;
    const bounded = boundedContext(item, depth + 1, nextAncestors);
    if (bounded !== undefined) result[key] = bounded;
  }
  return result;
};

const normalizeEngineErrorDetail = (
  value: unknown,
): EngineErrorDetail | undefined => {
  if (typeof value === "string") return boundedString(value);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const bounded = boundedContext(value, 0, new Set());
  if (!bounded || Array.isArray(bounded) || typeof bounded !== "object") {
    return undefined;
  }
  return bounded;
};

type EngineFailureShape = ProviderFailure;

export const engineFailureSchema = z
  .object({
    code: engineErrorCodeSchema,
    message: z.string().min(1).max(4_096),
    operation: engineOperationSchema,
    format: z.string().trim().min(1).max(64).optional(),
    retryable: z.boolean(),
    detail: z.unknown().optional(),
  })
  .transform((input): EngineFailureShape => {
    const detail = normalizeEngineErrorDetail(input.detail);
    return {
      code: input.code,
      message: input.message,
      operation: input.operation,
      ...(input.format ? { format: input.format } : {}),
      retryable: RETRYABLE_CODES.has(input.code),
      ...(detail ? { detail } : {}),
    };
  });

export type EngineFailure = z.infer<typeof engineFailureSchema>;
export type EngineFailureResult = EngineFailure & { ok: false };
type PublicEngineFailure = Omit<EngineFailure, "detail">;

type EngineFailureInput = Omit<EngineFailure, "retryable">;

export const createEngineFailure = (input: EngineFailureInput): EngineFailure =>
  engineFailureSchema.parse({
    code: input.code,
    message: input.message,
    operation: input.operation,
    ...(input.format ? { format: input.format } : {}),
    retryable: RETRYABLE_CODES.has(input.code),
    ...(input.detail !== undefined ? { detail: input.detail } : {}),
  });

const workerErrorSchema = z
  .object({
    code: engineErrorCodeSchema,
    message: z.string().min(1),
    detail: z.unknown().optional(),
    engineMessage: z.string().min(1).optional(),
  })
  .loose();

type NormalizeEngineErrorContext = {
  operation: EngineOperation;
  format?: string;
  fallbackMessage: string;
};

export const normalizeEngineError = (
  error: unknown,
  context: NormalizeEngineErrorContext,
): EngineFailure => {
  const parsed = workerErrorSchema.safeParse(error);
  if (parsed.success) {
    return createEngineFailure({
      code: parsed.data.code,
      message: parsed.data.message,
      operation: context.operation,
      format: context.format,
      detail: normalizeEngineErrorDetail(
        parsed.data.detail ?? parsed.data.engineMessage,
      ),
    });
  }

  const detail =
    error instanceof Error
      ? error.message
      : typeof error === "string" && error.length > 0
        ? error
        : undefined;

  return createEngineFailure({
    code: "internal_error",
    message: context.fallbackMessage,
    operation: context.operation,
    format: context.format,
    detail,
  });
};

export const toFailureResult = (
  failure: EngineFailure,
): EngineFailureResult => ({ ok: false, ...failure });

export const fromFailureResult = (
  failure: EngineFailureResult,
): EngineFailure =>
  createEngineFailure({
    code: failure.code,
    message: failure.message,
    operation: failure.operation,
    format: failure.format,
    detail: failure.detail,
  });

export const toPublicEngineFailure = (
  failure: EngineFailure,
): PublicEngineFailure => ({
  code: failure.code,
  message: PUBLIC_MESSAGE_BY_CODE[failure.code],
  operation: failure.operation,
  ...(failure.format && /^[a-z0-9][a-z0-9.+_-]{0,31}$/i.test(failure.format)
    ? { format: failure.format }
    : {}),
  retryable: RETRYABLE_CODES.has(failure.code),
});

export const toPublicEngineErrorResponse = (
  failure: EngineFailure,
): {
  body: PublicEngineFailure;
  status: number;
  headers: Record<string, string>;
} => {
  const body = toPublicEngineFailure(failure);
  return {
    body,
    status: engineErrorHttpStatus(failure.code),
    headers: {
      "X-DocKosha-Error-Code": body.code,
      "X-DocKosha-Retryable": String(body.retryable),
    },
  };
};

const PUBLIC_MESSAGE_BY_CODE: Readonly<Record<EngineErrorCode, string>> = {
  invalid_input: "The document request is invalid.",
  unsupported_format: "This file format is not supported.",
  unsupported_feature: "This document uses an unsupported feature.",
  missing_glyph: "This document contains unsupported text.",
  missing_asset: "A required document asset is unavailable.",
  password_protected: "Password-protected documents are not supported.",
  malformed_container: "This document could not be processed.",
  resource_limit: "This document exceeds processing limits.",
  invalid_output: "The document processor returned an invalid result.",
  internal_error: "The document could not be processed.",
  deadline_exceeded: "The document operation timed out. Please try again.",
  queue_busy: "The document processor is busy. Please try again.",
  worker_boot_failed:
    "The document processor is temporarily unavailable. Please try again.",
  engine_unavailable:
    "The document processor is temporarily unavailable. Please try again.",
  trap: "The document could not be processed.",
  protocol_error: "The document could not be processed.",
};

const HTTP_STATUS_BY_CODE: Readonly<Record<EngineErrorCode, number>> = {
  invalid_input: 400,
  unsupported_format: 415,
  unsupported_feature: 422,
  missing_glyph: 422,
  missing_asset: 422,
  password_protected: 422,
  malformed_container: 422,
  resource_limit: 413,
  invalid_output: 502,
  internal_error: 502,
  deadline_exceeded: 504,
  queue_busy: 429,
  worker_boot_failed: 503,
  engine_unavailable: 503,
  trap: 502,
  protocol_error: 502,
};

export const engineErrorHttpStatus = (code: EngineErrorCode): number =>
  HTTP_STATUS_BY_CODE[code];
