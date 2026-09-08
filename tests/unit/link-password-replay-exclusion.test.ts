import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const LINK_SETTINGS_PANEL_PATH =
  "src/components/documents/LinkSettingsPanel.tsx";

const getAttribute = (
  attributes: ts.JsxAttributes,
  name: string,
  sourceFile: ts.SourceFile,
): ts.JsxAttribute | undefined =>
  attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText(sourceFile) === name,
  );

const getStaticString = (
  attribute: ts.JsxAttribute | undefined,
): string | undefined => {
  const initializer = attribute?.initializer;
  return initializer && ts.isStringLiteral(initializer)
    ? initializer.text
    : undefined;
};

test("the link password input is explicitly excluded from PostHog replay", async () => {
  const source = await readFile(
    new URL(`../../${LINK_SETTINGS_PANEL_PATH}`, import.meta.url),
    "utf8",
  );
  const sourceFile = ts.createSourceFile(
    LINK_SETTINGS_PANEL_PATH,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const matches: ts.JsxSelfClosingElement[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(sourceFile) === "Input" &&
      getStaticString(getAttribute(node.attributes, "id", sourceFile)) ===
        "link-password"
    ) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  assert.equal(matches.length, 1);
  const input = matches[0];
  const className =
    getStaticString(getAttribute(input.attributes, "className", sourceFile)) ??
    "";

  assert.ok(className.split(/\s+/).includes("ph-no-capture"));
  assert.ok(
    getAttribute(input.attributes, "data-ph-no-capture", sourceFile),
    "link password input needs data-ph-no-capture",
  );
});
