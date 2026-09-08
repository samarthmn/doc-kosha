import assert from "node:assert/strict";
import test from "node:test";

import { resolveAuthReturnPath } from "@/modules/auth/returnPath";

test("auth return paths accept internal destinations and reject redirect escapes", () => {
  assert.equal(
    resolveAuthReturnPath("/documents?folder=customer"),
    "/documents?folder=customer",
  );

  for (const unsafePath of [
    null,
    "https://example.com/account",
    "//example.com/account",
    "/\\example.com/account",
    "/auth/sign-in",
    "/authentication",
  ]) {
    assert.equal(resolveAuthReturnPath(unsafePath), "/dashboard");
  }
});
