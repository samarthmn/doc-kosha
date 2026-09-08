import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const PUBLIC_COMMENTS_OVERLAY_PATH =
  "src/modules/comments/components/usePublicCommentsOverlay.tsx";

const getStaticClassTokens = (
  attributes: ts.JsxAttributes,
  sourceFile: ts.SourceFile,
): string[] => {
  const className = attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) &&
      property.name.getText(sourceFile) === "className",
  );
  const initializer = className?.initializer;
  if (!initializer || !ts.isStringLiteral(initializer)) return [];
  return initializer.text.split(/\s+/).filter(Boolean);
};

const findJsxElements = (
  root: ts.Node,
  predicate: (node: ts.JsxElement) => boolean,
): ts.JsxElement[] => {
  const matches: ts.JsxElement[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) && predicate(node)) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return matches;
};

test("the public comments sheet has a localized visually hidden title", async () => {
  const source = await readFile(
    new URL(`../../${PUBLIC_COMMENTS_OVERLAY_PATH}`, import.meta.url),
    "utf8",
  );
  const sourceFile = ts.createSourceFile(
    PUBLIC_COMMENTS_OVERLAY_PATH,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const sheetContents = findJsxElements(
    sourceFile,
    (node) =>
      node.openingElement.tagName.getText(sourceFile) === "SheetContent",
  );

  assert.equal(sheetContents.length, 1, "expected one mobile comments sheet");

  const titles = findJsxElements(
    sheetContents[0],
    (node) => node.openingElement.tagName.getText(sourceFile) === "SheetTitle",
  );
  assert.equal(
    titles.length,
    1,
    "the comments sheet must expose one accessible title",
  );
  assert.ok(
    getStaticClassTokens(
      titles[0].openingElement.attributes,
      sourceFile,
    ).includes("sr-only"),
    "the title must be visually hidden without being hidden from assistive technology",
  );
  assert.ok(
    titles[0].children.some(
      (child) =>
        ts.isJsxExpression(child) &&
        child.expression?.getText(sourceFile) === "messages.threadTitle",
    ),
    "the accessible title must use the localized comment-thread label",
  );
});
