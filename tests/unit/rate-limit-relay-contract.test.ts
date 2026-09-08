import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROUTE_CASES = [
  {
    route: "/api/contact",
    file: "src/app/api/contact/route.ts",
    validationGuard: "if (!parsed.success)",
    templateBuilder: "buildContactFormEmail(",
    emailBucket: "contact_form",
    emailIdentifier: "hashRateLimitIdentifier(email)",
    globalBucket: "contact_form_global",
    tooManyRequestsPattern:
      /NextResponse\.json\(\s*\{\s*ok:\s*false,\s*error:\s*"Too many requests"\s*\},\s*\{\s*status:\s*429\s*\}\s*,?\s*\)/,
  },
  {
    route: "/api/data-request",
    file: "src/app/api/data-request/route.ts",
    validationGuard: "if (!resolvedEmail)",
    templateBuilder: "buildDataRequestEmail(",
    emailBucket: "data_request",
    emailIdentifier: "hashRateLimitIdentifier(resolvedEmail)",
    globalBucket: "data_request_global",
    tooManyRequestsPattern:
      /NextResponse\.json\(\s*\{\s*error:\s*"Too many requests"\s*\},\s*\{\s*status:\s*429\s*\}\s*,?\s*\)/,
  },
] as const;

const readPostHandler = (file: string): string => {
  const source = readFileSync(path.join(process.cwd(), file), "utf8");
  const handlerStart = source.indexOf("export async function POST");

  assert.notEqual(handlerStart, -1, `${file} must export POST`);
  return source.slice(handlerStart);
};

for (const routeCase of ROUTE_CASES) {
  test(`${routeCase.route} rate-limits validated email relay requests before sending`, () => {
    const handler = readPostHandler(routeCase.file);
    const consumeIndexes = [
      ...handler.matchAll(/\bconsumeRateLimit\s*\(/g),
    ].map(({ index }) => index);
    const templateIndex = handler.indexOf(routeCase.templateBuilder);
    const sendIndex = handler.indexOf("sendAppEmail(");
    const validationIndex = handler.indexOf(routeCase.validationGuard);

    assert.equal(
      consumeIndexes.length,
      2,
      "the per-email and global limits must each be consumed",
    );
    assert.notEqual(
      templateIndex,
      -1,
      "the route must still build the relay email",
    );
    assert.notEqual(sendIndex, -1, "the route must still send the relay email");
    assert.notEqual(validationIndex, -1, "the validation guard must remain");
    assert.ok(
      consumeIndexes.every((index) => index < sendIndex),
      "both rate limits must be consumed before sendAppEmail",
    );
    assert.ok(
      consumeIndexes.every((index) => index < templateIndex),
      "both rate limits must be consumed before building the relay email",
    );
    assert.ok(
      consumeIndexes.every((index) => index > validationIndex),
      "malformed requests must be rejected before consuming rate-limit budget",
    );

    assert.match(
      handler,
      new RegExp(
        String.raw`bucket:\s*"${routeCase.emailBucket}"[\s\S]*?identifier:\s*${routeCase.emailIdentifier.replace(/[()]/g, String.raw`\$&`)}[\s\S]*?limit:\s*5[\s\S]*?windowSeconds:\s*86_?400`,
      ),
    );
    assert.match(
      handler,
      new RegExp(
        String.raw`bucket:\s*"${routeCase.globalBucket}"[\s\S]*?identifier:\s*"all"[\s\S]*?limit:\s*100[\s\S]*?windowSeconds:\s*86_?400`,
      ),
    );

    const identifiers = [...handler.matchAll(/identifier:\s*([^,\n]+)/g)].map(
      (match) => match[1]?.trim(),
    );
    assert.deepEqual(identifiers, [routeCase.emailIdentifier, '"all"']);

    assert.match(
      handler,
      /if\s*\(\s*!emailRateLimit\.allowed\s*\|\|\s*!globalRateLimit\.allowed\s*\)/,
    );
    assert.match(handler, routeCase.tooManyRequestsPattern);
    assert.doesNotMatch(
      handler,
      /requestIp|getRequestIp|clientIp|ipAddress|x-forwarded-for|x-real-ip|cf-connecting-ip|true-client-ip/i,
    );
  });

  test(`${routeCase.route} uses the service-role client for rate-limit writes`, () => {
    const source = readFileSync(
      path.join(process.cwd(), routeCase.file),
      "utf8",
    );
    const handler = readPostHandler(routeCase.file);
    const serviceClientMatch = handler.match(
      /const\s+(\w+)\s*=\s*createSupabaseServiceClient\(\)/,
    );

    assert.match(
      source,
      /import\s*\{\s*createSupabaseServiceClient\s*\}\s*from\s*"@\/lib\/supabase\/serviceClient"/,
    );
    assert.ok(
      serviceClientMatch,
      "the route must create a service-role client",
    );

    const serviceClientName = serviceClientMatch[1];
    const consumedClientNames = [
      ...handler.matchAll(/consumeRateLimit\(\s*(\w+)\s*,/g),
    ].map((match) => match[1]);

    assert.deepEqual(consumedClientNames, [
      serviceClientName,
      serviceClientName,
    ]);
    assert.ok(
      handler.indexOf("createSupabaseServiceClient()") <
        handler.indexOf("consumeRateLimit("),
      "the privileged client must be created before rate-limit consumption",
    );
  });
}
