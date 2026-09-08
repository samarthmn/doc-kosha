import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DocumentDeletionConflictError,
  VersioningPreMutationConflictError,
  runVersioningPreMutation,
  throwVersioningRepositoryError,
} from "@/modules/document-versioning/server/errors";

const routeSource = readFileSync(
  new URL(
    "../../src/app/api/documents/versioning/replace/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const serviceSource = readFileSync(
  new URL(
    "../../src/modules/document-versioning/server/service.ts",
    import.meta.url,
  ),
  "utf8",
);

test("preserves the database deletion-fence error", () => {
  assert.throws(
    () =>
      throwVersioningRepositoryError(
        { code: "P0006", message: "resource is claimed for deletion" },
        "fallback",
      ),
    DocumentDeletionConflictError,
  );
  assert.throws(
    () =>
      throwVersioningRepositoryError(
        { code: "XX000", message: "database unavailable" },
        "fallback",
      ),
    /database unavailable/,
  );
});

test("marks only pre-upload-pointer deletion conflicts as cleanup-safe", async () => {
  await assert.rejects(
    runVersioningPreMutation(async () => {
      throw new DocumentDeletionConflictError();
    }),
    VersioningPreMutationConflictError,
  );
  await assert.rejects(
    runVersioningPreMutation(async () => {
      throw new Error("unknown commit outcome");
    }),
    /unknown commit outcome/,
  );
});

test("replacement route maps cleanup-safe deletion conflicts to 409", () => {
  assert.match(routeSource, /VersioningPreMutationConflictError/);
  assert.match(routeSource, /DOCUMENT_DELETION_IN_PROGRESS/);
  assert.match(routeSource, /status: 409/);
});

test("replacement wraps only operations before the uploaded pointer commits", () => {
  const start = serviceSource.indexOf("export const replaceWithVersioning");
  const end = serviceSource.indexOf("export const getVersionHistory", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const replacementSource = serviceSource.slice(start, end);

  assert.equal(replacementSource.match(/runVersioningPreMutation/g)?.length, 4);
  assert.match(
    replacementSource,
    /runVersioningPreMutation\(\(\) =>\s*cleanupExpiredPrunedMetadata/,
  );
  assert.match(
    replacementSource,
    /runVersioningPreMutation\(\(\) =>\s*insertArchivedVersion/,
  );

  const postPointerStart = replacementSource.indexOf(
    "const currentVersions = await listAvailableVersionsForDocument",
  );
  assert.notEqual(postPointerStart, -1);
  const postPointerSource = replacementSource.slice(postPointerStart);
  assert.match(postPointerSource, /await updateVersionStates/);
  assert.doesNotMatch(postPointerSource, /runVersioningPreMutation/);
  assert.doesNotMatch(routeSource, /DocumentDeletionConflictError/);
});
