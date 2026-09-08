import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const AUTH_PAGE_PATH = "src/components/auth/AuthPage.tsx";

test("each authentication step exposes its primary route heading as an h1", async () => {
  const source = await readFile(
    new URL(`../../${AUTH_PAGE_PATH}`, import.meta.url),
    "utf8",
  );
  const sourceFile = ts.createSourceFile(
    AUTH_PAGE_PATH,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const primaryHeadingTags: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node)) {
      const tagName = node.openingElement.tagName.getText(sourceFile);
      const isHeading = tagName === "h1" || tagName === "h2";
      const headingSource = node.getText(sourceFile);
      if (
        isHeading &&
        (headingSource.includes("{heading}") ||
          headingSource.includes("Check your email"))
      ) {
        primaryHeadingTags.push(tagName);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  assert.deepEqual(primaryHeadingTags, ["h1", "h1"]);
});
