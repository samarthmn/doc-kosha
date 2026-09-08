import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const PUBLIC_HEADER_PATH = "src/components/public/PublicHeader.tsx";

const getAttribute = (
  attributes: ts.JsxAttributes,
  name: string,
  sourceFile: ts.SourceFile,
): ts.JsxAttribute | undefined =>
  attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText(sourceFile) === name,
  );

const getAttributeExpression = (
  attributes: ts.JsxAttributes,
  name: string,
  sourceFile: ts.SourceFile,
): ts.Expression | undefined => {
  const initializer = getAttribute(attributes, name, sourceFile)?.initializer;
  if (!initializer || !ts.isJsxExpression(initializer)) return undefined;
  return initializer.expression;
};

const getStaticClassTokens = (
  attributes: ts.JsxAttributes,
  sourceFile: ts.SourceFile,
): string[] => {
  const initializer = getAttribute(
    attributes,
    "className",
    sourceFile,
  )?.initializer;
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

const isDownloadLabelExpression = (
  expression: ts.Expression | undefined,
  sourceFile: ts.SourceFile,
): boolean =>
  Boolean(
    expression &&
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
    expression.left.getText(sourceFile) === "labels?.download" &&
    ts.isStringLiteral(expression.right) &&
    expression.right.text === "Download",
  );

test("each public header branding branch exposes exactly one resource-title h1", async () => {
  const source = await readFile(
    new URL(`../../${PUBLIC_HEADER_PATH}`, import.meta.url),
    "utf8",
  );
  const sourceFile = ts.createSourceFile(
    PUBLIC_HEADER_PATH,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const brandingConditionals: ts.ConditionalExpression[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isConditionalExpression(node) &&
      node.condition.getText(sourceFile) === "hasBranding"
    ) {
      brandingConditionals.push(node);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  assert.equal(
    brandingConditionals.length,
    1,
    "expected one hasBranding render conditional",
  );
  const brandingConditional = brandingConditionals[0];
  const brandedHeadings = findJsxElements(
    brandingConditional.whenTrue,
    (node) => node.openingElement.tagName.getText(sourceFile) === "h1",
  );
  const unbrandedHeadings = findJsxElements(
    brandingConditional.whenFalse,
    (node) => node.openingElement.tagName.getText(sourceFile) === "h1",
  );

  assert.equal(brandedHeadings.length, 1);
  assert.equal(unbrandedHeadings.length, 1);

  for (const heading of [...brandedHeadings, ...unbrandedHeadings]) {
    assert.match(
      heading.getText(sourceFile),
      /\{title \|\| "Document Viewer"\}/,
    );
  }

  const brandedHeadingClasses = getStaticClassTokens(
    brandedHeadings[0].openingElement.attributes,
    sourceFile,
  );
  const unbrandedHeadingClasses = getStaticClassTokens(
    unbrandedHeadings[0].openingElement.attributes,
    sourceFile,
  );
  assert.ok(brandedHeadingClasses.includes("sr-only"));
  assert.ok(!unbrandedHeadingClasses.includes("sr-only"));
});

test("public header actions retain their localized accessible labels", async () => {
  const source = await readFile(
    new URL(`../../${PUBLIC_HEADER_PATH}`, import.meta.url),
    "utf8",
  );
  const sourceFile = ts.createSourceFile(
    PUBLIC_HEADER_PATH,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const ariaLabelSources: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const expression = getAttributeExpression(
        node.attributes,
        "aria-label",
        sourceFile,
      );
      if (expression) ariaLabelSources.push(expression.getText(sourceFile));
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  for (const expectedLabel of [
    'labels?.backToDataRoom ?? "Back to data room"',
    'labels?.feedback ?? "Feedback"',
    'labels?.qAndA ?? "Q&A"',
    'labels?.download ?? "Download"',
  ]) {
    assert.ok(
      ariaLabelSources.includes(expectedLabel),
      `missing action label: ${expectedLabel}`,
    );
  }

  const commentsLabel = ariaLabelSources.find(
    (label) =>
      label.includes('labels?.hideComments ?? "Hide comments"') &&
      label.includes('labels?.showComments ?? "Show comments"'),
  );
  assert.ok(commentsLabel, "comments switch must retain both state labels");
});

test("the public download button keeps an accessible name when its visible label is hidden on mobile", async () => {
  const source = await readFile(
    new URL(`../../${PUBLIC_HEADER_PATH}`, import.meta.url),
    "utf8",
  );
  const sourceFile = ts.createSourceFile(
    PUBLIC_HEADER_PATH,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const downloadButtons = findJsxElements(sourceFile, (node) => {
    if (node.openingElement.tagName.getText(sourceFile) !== "Button") {
      return false;
    }
    return (
      getAttributeExpression(
        node.openingElement.attributes,
        "onClick",
        sourceFile,
      )?.getText(sourceFile) === "actions.onDownload"
    );
  });

  assert.equal(
    downloadButtons.length,
    1,
    "expected one public download button",
  );
  const downloadButton = downloadButtons[0];

  const responsiveLabels = findJsxElements(downloadButton, (node) => {
    if (node.openingElement.tagName.getText(sourceFile) !== "span") {
      return false;
    }
    return node.children.some(
      (child) =>
        ts.isJsxExpression(child) &&
        isDownloadLabelExpression(child.expression, sourceFile),
    );
  });

  assert.equal(
    responsiveLabels.length,
    1,
    "expected one responsive visible download label",
  );
  const labelClasses = getStaticClassTokens(
    responsiveLabels[0].openingElement.attributes,
    sourceFile,
  );
  assert.ok(labelClasses.includes("hidden"));
  assert.ok(labelClasses.includes("sm:inline"));

  const accessibleName = getAttributeExpression(
    downloadButton.openingElement.attributes,
    "aria-label",
    sourceFile,
  );
  assert.ok(
    isDownloadLabelExpression(accessibleName, sourceFile),
    "download button must keep the localized Download aria-label",
  );
});

test("each public header dialog uses one responsive trigger so focus returns to the visible opener", async () => {
  const source = await readFile(
    new URL(`../../${PUBLIC_HEADER_PATH}`, import.meta.url),
    "utf8",
  );
  const sourceFile = ts.createSourceFile(
    PUBLIC_HEADER_PATH,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const dialogs = findJsxElements(
    sourceFile,
    (node) => node.openingElement.tagName.getText(sourceFile) === "Dialog",
  );

  assert.equal(dialogs.length, 2, "expected Feedback and Q&A dialogs");

  for (const dialog of dialogs) {
    const triggers = findJsxElements(
      dialog,
      (node) =>
        node.openingElement.tagName.getText(sourceFile) === "DialogTrigger",
    );
    assert.equal(
      triggers.length,
      1,
      "each dialog must mount exactly one trigger for reliable focus restoration",
    );

    const triggerLabels = findJsxElements(
      triggers[0],
      (node) => node.openingElement.tagName.getText(sourceFile) === "span",
    ).filter((label) => {
      const classes = getStaticClassTokens(
        label.openingElement.attributes,
        sourceFile,
      );
      return classes.includes("hidden") && classes.includes("md:inline");
    });
    assert.equal(
      triggerLabels.length,
      1,
      "the single trigger must reveal its text label at the desktop breakpoint",
    );
  }
});

test("comment verification actions stack before the small breakpoint", async () => {
  const source = await readFile(
    new URL(
      "../../src/components/pages/PublicDocumentViewerClient.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    source,
    /<DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">/,
  );
  assert.match(
    source,
    /className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center"/,
  );
});
