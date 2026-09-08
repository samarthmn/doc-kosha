import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const studioSource = readFileSync(
  path.join(
    process.cwd(),
    "src",
    "components",
    "documents",
    "redaction",
    "DocumentRedactionStudio.tsx",
  ),
  "utf8",
);

test("redaction studio parses the client-safe warning header allowlist", () => {
  assert.match(studioSource, /REDACTION_WARNINGS_HEADER/);
  assert.match(studioSource, /REDACTION_WARNING_CODES/);
  assert.match(
    studioSource,
    /headers\.get\(REDACTION_WARNINGS_HEADER\)[\s\S]*\.split\(","\)[\s\S]*\.trim\(\)/,
  );
});

test("redaction studio holds over-redacted bytes for explicit confirmation", () => {
  assert.match(studioSource, /generateRedactedPdf/);
  assert.match(studioSource, /commitRedactedPdf/);
  assert.match(
    studioSource,
    /warningCodes\.includes\("over_redaction"\)[\s\S]*setPendingRedactedPdf/,
  );
  assert.match(studioSource, /Extra content may have been removed/);
});

test("redaction warning discard handler is mutation-free", () => {
  const discardStart = studioSource.indexOf(
    "const discardPendingRedactedPdf = useCallback",
  );
  const confirmStart = studioSource.indexOf(
    "const confirmPendingRedactedPdf = useCallback",
  );

  assert.notEqual(discardStart, -1);
  assert.ok(confirmStart > discardStart);

  const discardSource = studioSource.slice(discardStart, confirmStart);
  assert.match(discardSource, /setPendingRedactedPdf\(null\)/);
  assert.match(discardSource, /setIsSaving\(false\)/);
  assert.doesNotMatch(
    discardSource,
    /fetch\(|supabase|commitRedactedPdf|deleteUploadedObject/,
  );
  assert.match(
    studioSource,
    /onOpenChange=\{\(open\) => \{[\s\S]*discardPendingRedactedPdf\(\)/,
  );
});

test("redaction studio reserves a bounded mobile document canvas", () => {
  const canvasClasses =
    studioSource.match(/"([^"]*h-\[68dvh\][^"]*)"/)?.[1].split(/\s+/) ?? [];

  for (const token of [
    "flex",
    "flex-col",
    "h-[68dvh]",
    "min-h-[28rem]",
    "max-h-[44rem]",
    "lg:h-auto",
    "lg:min-h-0",
    "lg:max-h-none",
  ]) {
    assert.ok(canvasClasses.includes(token), `missing ${token}`);
  }
  assert.match(studioSource, /className="h-full min-h-0 w-full flex-1"/);
});
