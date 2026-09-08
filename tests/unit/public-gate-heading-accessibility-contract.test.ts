import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const PUBLIC_GATE_SHELL_PATH = "src/components/public/PublicGateShell.tsx";
const PUBLIC_NDA_GATE_PATH = "src/components/public/PublicNdaGate.tsx";

test("the public gate route title is an h1", async () => {
  const source = await readFile(
    new URL(`../../${PUBLIC_GATE_SHELL_PATH}`, import.meta.url),
    "utf8",
  );
  const sourceFile = ts.createSourceFile(
    PUBLIC_GATE_SHELL_PATH,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const titleHeadingTags: string[] = [];
  const headingTags = new Set(["h1", "h2", "h3", "h4", "CardTitle"]);

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node)) {
      const tagName = node.openingElement.tagName.getText(sourceFile);
      if (
        headingTags.has(tagName) &&
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

test("each public NDA step exposes its primary screen heading as an h1", async () => {
  const source = await readFile(
    new URL(`../../${PUBLIC_NDA_GATE_PATH}`, import.meta.url),
    "utf8",
  );
  const sourceFile = ts.createSourceFile(
    PUBLIC_NDA_GATE_PATH,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const primaryHeadingTags: string[] = [];
  const primaryMessageKeys = [
    "messages.processingTitle",
    "messages.introTitle",
    "messages.verifyEmailTitle",
    "messages.signTitle",
  ];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node)) {
      const tagName = node.openingElement.tagName.getText(sourceFile);
      if (
        /^h[1-6]$/.test(tagName) &&
        primaryMessageKeys.some((key) => node.getText(sourceFile).includes(key))
      ) {
        primaryHeadingTags.push(tagName);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  assert.deepEqual(primaryHeadingTags, ["h1", "h1", "h1", "h1"]);
});

test("the public NDA signature choices expose stable named groups", async () => {
  const source = await readFile(
    new URL(`../../${PUBLIC_NDA_GATE_PATH}`, import.meta.url),
    "utf8",
  );
  const sourceFile = ts.createSourceFile(
    PUBLIC_NDA_GATE_PATH,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const groupLabels: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node)) {
      const attributes = node.openingElement.attributes.properties;
      const role = attributes.find(
        (attribute): attribute is ts.JsxAttribute =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(sourceFile) === "role",
      );
      const label = attributes.find(
        (attribute): attribute is ts.JsxAttribute =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(sourceFile) === "aria-label",
      );

      if (
        role?.initializer &&
        ts.isStringLiteral(role.initializer) &&
        role.initializer.text === "group" &&
        label?.initializer &&
        ts.isJsxExpression(label.initializer) &&
        label.initializer.expression
      ) {
        groupLabels.push(label.initializer.expression.getText(sourceFile));
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  assert.deepEqual(groupLabels, [
    "messages.drawSignature",
    "messages.typeSignature",
  ]);
});
