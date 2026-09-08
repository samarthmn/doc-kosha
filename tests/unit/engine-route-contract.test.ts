import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  ENGINE_ERROR_CODES,
  createEngineFailure,
  toPublicEngineErrorResponse,
  type EngineErrorCode,
  type EngineOperation,
} from "@/server/engineErrors";

const ALL_ENGINE_CODES = [...ENGINE_ERROR_CODES];
const EXPECTED_STATUS: Readonly<Record<EngineErrorCode, number>> = {
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

const ROUTE_CASES = [
  {
    route: "/api/convert/document",
    file: "src/app/api/convert/document/route.ts",
    codes: ALL_ENGINE_CODES,
    operation: "conversion",
  },
  {
    route: "/api/documents/redaction",
    file: "src/app/api/documents/redaction/route.ts",
    codes: ALL_ENGINE_CODES,
    operation: "redaction",
  },
  {
    route: "/api/public/links/download",
    file: "src/app/api/public/links/download/route.ts",
    codes: ALL_ENGINE_CODES,
    operation: "watermark",
  },
  {
    route: "/api/public/links/file",
    file: "src/app/api/public/links/file/route.ts",
    codes: ALL_ENGINE_CODES,
    operation: "watermark",
  },
  {
    route: "/api/public/links/signed-url",
    file: "src/app/api/public/links/signed-url/route.ts",
    codes: ["deadline_exceeded"] as const,
    operation: "conversion",
  },
  {
    route: "/api/public/links/download-merged",
    file: "src/app/api/public/links/download-merged/route.ts",
    codes: ALL_ENGINE_CODES,
    operation: "merge",
  },
  {
    route: "/api/public/links/download-zip",
    file: "src/app/api/public/links/download-zip/route.ts",
    codes: ALL_ENGINE_CODES,
    operation: "watermark",
  },
  {
    route: "/api/data-rooms/download-zip",
    file: "src/app/api/data-rooms/download-zip/route.ts",
    codes: ["deadline_exceeded"] as const,
    operation: "conversion",
  },
  {
    route: "/api/watermarks/preview",
    file: "src/app/api/watermarks/preview/route.ts",
    codes: ALL_ENGINE_CODES,
    operation: "watermark",
  },
] as const satisfies ReadonlyArray<{
  route: string;
  file: string;
  codes: readonly EngineErrorCode[];
  operation: EngineOperation;
}>;

for (const routeCase of ROUTE_CASES) {
  test(`${routeCase.route} emits the shared engine envelope for every reachable code`, () => {
    const source = readFileSync(
      path.join(process.cwd(), routeCase.file),
      "utf8",
    );
    assert.match(source, /toPublicEngineErrorResponse/);

    for (const code of routeCase.codes) {
      const failure = createEngineFailure({
        code,
        message: "internal engine prose: /workspace/customer.pdf",
        operation: routeCase.operation,
        format: "pdf",
        detail: {
          reason: "private_reason",
          context: { documentText: "secret document content" },
        },
      });
      const response = toPublicEngineErrorResponse(failure);

      assert.equal(response.status, EXPECTED_STATUS[code], code);
      assert.deepEqual(Object.keys(response.body).sort(), [
        "code",
        "format",
        "message",
        "operation",
        "retryable",
      ]);
      assert.equal(response.body.code, code);
      assert.equal("detail" in response.body, false);
      assert.doesNotMatch(
        JSON.stringify(response.body),
        /workspace|private_reason|secret document/,
      );
    }
  });
}

test("conversion defaults route through the provider facade and keep the pure router provider-neutral", () => {
  const conversionService = readFileSync(
    path.join(process.cwd(), "src/server/conversionService.ts"),
    "utf8",
  );
  const officeRouter = readFileSync(
    path.join(process.cwd(), "src/server/officeEngineRouter.ts"),
    "utf8",
  );

  assert.match(conversionService, /@\/server\/documentProcessing\/provider/);
  assert.doesNotMatch(conversionService, /@\/server\/(?:pdf|office)CoreWasm/);
  assert.match(officeRouter, /@dockosha\/provider-interface/);
  assert.doesNotMatch(officeRouter, /@\/server\/(?:pdf|office)CoreWasm/);
});
