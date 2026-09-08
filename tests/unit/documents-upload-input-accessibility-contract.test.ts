import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const DOCUMENTS_CLIENT_PATH = "src/components/pages/DocumentsClient.tsx";

const getAttribute = (
  attributes: ts.JsxAttributes,
  name: string,
  sourceFile: ts.SourceFile,
): ts.JsxAttribute | undefined =>
  attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText(sourceFile) === name,
  );

const getAttributeText = (
  attributes: ts.JsxAttributes,
  name: string,
  sourceFile: ts.SourceFile,
): string | undefined => {
  const initializer = getAttribute(attributes, name, sourceFile)?.initializer;
  if (!initializer) return undefined;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (!ts.isJsxExpression(initializer) || !initializer.expression) {
    return undefined;
  }
  return initializer.expression.getText(sourceFile);
};

test("the shared document upload file inputs have stable accessible names", async () => {
  const source = await readFile(
    new URL(`../../${DOCUMENTS_CLIENT_PATH}`, import.meta.url),
    "utf8",
  );
  const sourceFile = ts.createSourceFile(
    DOCUMENTS_CLIENT_PATH,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const uploadInputs: Array<{
    ref: string | undefined;
    label: string | undefined;
  }> = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(sourceFile) === "input" &&
      getAttributeText(node.attributes, "type", sourceFile) === "file"
    ) {
      uploadInputs.push({
        ref: getAttributeText(node.attributes, "ref", sourceFile),
        label: getAttributeText(node.attributes, "aria-label", sourceFile),
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  assert.deepEqual(uploadInputs, [
    { ref: "filesInputRef", label: "Upload files" },
    { ref: "folderInputRef", label: "Upload folder" },
  ]);
});
