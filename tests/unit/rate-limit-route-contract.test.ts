import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const readRoute = (relativePath: string): string =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

const otpSource = readRoute("src/app/api/public/links/otp/route.ts");
const resolveSource = readRoute("src/app/api/public/links/resolve/route.ts");

const sliceBetween = (
  source: string,
  startMarker: string,
  endMarker?: string,
): string => {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);

  if (!endMarker) return source.slice(start);

  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
};

test("OTP rate limits run before email delivery and code comparison", () => {
  const sendBranch = sliceBetween(
    otpSource,
    'if (action === "send")',
    'if (action === "verify")',
  );
  const verifyBranch = sliceBetween(
    otpSource,
    'if (action === "verify")',
    'return NextResponse.json({ error: "Invalid action" }',
  );

  const sendEmailLimit = sendBranch.indexOf('bucket: "otp_send_email"');
  const sendLinkLimit = sendBranch.indexOf('bucket: "otp_send_link"');
  const emailDelivery = sendBranch.indexOf("sendAuthEmail(");
  assert.ok(sendEmailLimit >= 0);
  assert.ok(sendLinkLimit >= 0);
  assert.ok(emailDelivery >= 0);
  assert.ok(sendEmailLimit < emailDelivery);
  assert.ok(sendLinkLimit < emailDelivery);
  assert.match(sendBranch.slice(0, emailDelivery), /consumeRateLimit\(/);

  const verifyLimit = verifyBranch.indexOf('bucket: "otp_verify"');
  const comparison = verifyBranch.indexOf("timingSafeEqual(");
  assert.ok(verifyLimit >= 0);
  assert.ok(comparison >= 0);
  assert.ok(verifyLimit < comparison);
  assert.match(verifyBranch.slice(0, comparison), /consumeRateLimit\(/);
});

test("all password branches share one limiter before bcrypt comparison", () => {
  const helperCalls =
    resolveSource.match(/\benforcePasswordRateLimit\(/g) ?? [];
  assert.equal(helperCalls.length, 3, "one call in each password branch");

  const branches = [
    sliceBetween(
      resolveSource,
      "const resolveDocument = async",
      "const resolveDataRoom = async",
    ),
    sliceBetween(
      resolveSource,
      "const resolveDataRoom = async",
      "const resolveDataRoomDocument = async",
    ),
    sliceBetween(resolveSource, "const resolveDataRoomDocument = async"),
  ];

  for (const branch of branches) {
    const limiter = branch.indexOf("enforcePasswordRateLimit(");
    const comparison = branch.indexOf("bcrypt.compare(");
    assert.ok(limiter >= 0);
    assert.ok(comparison >= 0);
    assert.ok(limiter < comparison);
  }
});

test("limiter breaches use the existing wrong-credential literals", () => {
  const invalidOtpResponse = sliceBetween(
    otpSource,
    "const invalidOtpResponse",
    "export async function POST",
  );
  assert.match(invalidOtpResponse, /error: "Invalid or expired code"/);

  const passwordLimiter = sliceBetween(
    resolveSource,
    "const enforcePasswordRateLimit",
    "const fetchWorkspaceName",
  );
  // The breach response and the wrong-credential response are now literally
  // the same function, which is a stronger guarantee than matching literals:
  // they cannot drift apart.
  assert.match(passwordLimiter, /return badPasswordResponse\(publicLanguage\)/);
  const badPasswordHelper = sliceBetween(
    resolveSource,
    "const badPasswordResponse",
    "const enforcePasswordRateLimit",
  );
  assert.match(badPasswordHelper, /error: "Incorrect password"/);
  assert.match(badPasswordHelper, /code: "BAD_PASSWORD"/);
  // Charge atomically BEFORE bcrypt (a pre-read lets concurrent attempts pass
  // the same stale count) and release on success, so legitimate viewers
  // sharing one link consume nothing on net and cannot lock each other out.
  assert.match(resolveSource, /const releasePasswordCharge/);
  assert.match(resolveSource, /increment: -1/);
  assert.doesNotMatch(passwordLimiter, /increment: 0/);
  assert.match(passwordLimiter, /PASSWORD_FAILURE_BUCKET/);
  // A refused attempt must also release, or a blocked window ratchets upward
  // on every retry and never recovers within its own window.
  assert.match(passwordLimiter, /await releasePasswordCharge/);
  // No per-viewer bucket: every candidate cookie key is only issued AFTER the
  // password gate, so such a bucket silently collapses to one shared key and
  // a handful of mistypes locks out the whole audience.
  assert.doesNotMatch(resolveSource, /PASSWORD_VIEWER_BUCKET/);

  assert.doesNotMatch(
    otpSource,
    /Too many (?:OTP|verification|code) attempts/i,
  );
  assert.doesNotMatch(resolveSource, /Too many password attempts/i);
});

test("OTP verification compares in constant time and increments attempts once", () => {
  const verifyBranch = sliceBetween(
    otpSource,
    'if (action === "verify")',
    'return NextResponse.json({ error: "Invalid action" }',
  );
  const attemptStage = sliceBetween(
    verifyBranch,
    "const { data: otp",
    "timingSafeEqual(",
  );

  assert.match(verifyBranch, /timingSafeEqual\(/);
  assert.match(verifyBranch, /\.select\("id, code_hash, attempts"\)/);
  assert.doesNotMatch(verifyBranch, /\.eq\("code_hash"/);
  assert.equal(attemptStage.match(/\.update\(/g)?.length, 1);
  assert.match(attemptStage, /\.update\(\{ attempts: otp\.attempts \+ 1 \}\)/);
  assert.match(attemptStage, /\.eq\("attempts", otp\.attempts\)/);
  assert.match(attemptStage, /\.select\("attempts"\)/);
});

test("public auth rate limiting never imports an IP helper", () => {
  assert.doesNotMatch(otpSource, /requestIp/);
  assert.doesNotMatch(resolveSource, /requestIp/);
});
