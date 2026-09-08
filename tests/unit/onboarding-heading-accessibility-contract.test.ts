import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const ONBOARDING_STEP_HEADER_PATH =
  "src/components/onboarding/OnboardingStepHeader.tsx";

test("onboarding step titles are route-level h1 headings", async () => {
  const source = await readFile(
    new URL(`../../${ONBOARDING_STEP_HEADER_PATH}`, import.meta.url),
    "utf8",
  );
  const sourceFile = ts.createSourceFile(
    ONBOARDING_STEP_HEADER_PATH,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const titleHeadingTags: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node)) {
      const tagName = node.openingElement.tagName.getText(sourceFile);
      if (
        /^h[1-6]$/.test(tagName) &&
        node.getText(sourceFile).includes("{title}")
      ) {
        titleHeadingTags.push(tagName);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  assert.deepEqual(titleHeadingTags, ["h1"]);
});
