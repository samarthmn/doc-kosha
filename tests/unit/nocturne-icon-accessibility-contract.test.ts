import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const TASK_10_ICON_FILES = [
  "src/components/documents/internal/InternalDocumentAuditLogPanel.tsx",
  "src/components/documents/internal/InternalDocumentCommentsPanel.tsx",
  "src/components/pages/DocumentsClient.tsx",
  "src/components/providers/UploadQueueProvider.tsx",
  "src/components/ui/checkbox.tsx",
  "src/components/ui/dropdown-menu.tsx",
  "src/components/ui/radio-group.tsx",
  "src/components/ui/select.tsx",
  "src/components/ui/sidebar.tsx",
] as const;

const parseSource = (path: string, source: string): ts.SourceFile =>
  ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

const isSemanticallyHidden = (
  attributes: ts.JsxAttributes,
  sourceFile: ts.SourceFile,
): boolean => {
  const attribute = attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) &&
      property.name.getText(sourceFile) === "aria-hidden",
  );
  if (!attribute) return false;
  if (!attribute.initializer) return true;
  if (ts.isStringLiteral(attribute.initializer)) {
    return attribute.initializer.text === "true";
  }
  if (
    !ts.isJsxExpression(attribute.initializer) ||
    !attribute.initializer.expression
  ) {
    return false;
  }
  return (
    attribute.initializer.expression.kind === ts.SyntaxKind.TrueKeyword ||
    (ts.isStringLiteral(attribute.initializer.expression) &&
      attribute.initializer.expression.text === "true")
  );
};

const hasAccessibleName = (
  attributes: ts.JsxAttributes,
  sourceFile: ts.SourceFile,
): boolean =>
  attributes.properties.some(
    (property) =>
      ts.isJsxAttribute(property) &&
      property.name.getText(sourceFile) === "aria-label" &&
      Boolean(property.initializer),
  );

const auditDecorativePhosphorIcons = (
  path: string,
  source: string,
): string[] => {
  const sourceFile = parseSource(path, source);
  const importedIconNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@phosphor-icons/react"
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      importedIconNames.add(element.name.text);
    }
  }

  const violations: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (
        importedIconNames.has(tagName) &&
        !hasAccessibleName(node.attributes, sourceFile) &&
        !isSemanticallyHidden(node.attributes, sourceFile)
      ) {
        const position = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        violations.push(`${path}:${position.line + 1} <${tagName}>`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
};

test("audited decorative direct Phosphor renders are hidden from assistive technology", async () => {
  const violations: string[] = [];

  for (const path of TASK_10_ICON_FILES) {
    const source = await readFile(
      new URL(`../../${path}`, import.meta.url),
      "utf8",
    );
    violations.push(...auditDecorativePhosphorIcons(path, source));
  }

  assert.deepEqual(violations, []);
});

test("the icon audit rejects aria-hidden={false}", () => {
  const fixture = `
    import { Eye } from "@phosphor-icons/react";
    export const Fixture = () => <button aria-label="Preview"><Eye aria-hidden={false} /></button>;
  `;

  assert.deepEqual(
    auditDecorativePhosphorIcons("negative-fixture.tsx", fixture),
    ["negative-fixture.tsx:3 <Eye>"],
  );
});
