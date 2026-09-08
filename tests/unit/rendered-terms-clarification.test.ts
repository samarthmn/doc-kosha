import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("rendered hosted Terms include the separately licensed software clause", async () => {
  const require = createRequire(import.meta.url);
  const serverOnlyPath = require.resolve("server-only");
  const serverOnlyModule = new Module(serverOnlyPath);
  serverOnlyModule.filename = serverOnlyPath;
  serverOnlyModule.exports = {};
  require.cache[serverOnlyPath] = serverOnlyModule;
  const { default: TermsAndConditionsContent } =
    await import("@/app/terms-and-conditions/TermsAndConditionsContent");
  const rendered = renderToStaticMarkup(
    React.createElement(TermsAndConditionsContent),
  );
  assert.match(rendered, /Separately licensed software/u);
  assert.match(
    rendered,
    /https:\/\/github\.com\/samarthmn\/doc-kosha\/blob\/main\/LICENSE/u,
  );
  assert.match(rendered, /does not grant access to private DocYantra/u);
  assert.match(rendered, /authorize bypassing service access controls/u);
  assert.match(rendered, /activate any browser-runtime license/u);
});
