import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const readSource = async (path: string): Promise<string> =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const parseSource = (path: string, source: string): ts.SourceFile =>
  ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

const collectOpenings = (
  sourceFile: ts.SourceFile,
  tagName: string,
): Array<ts.JsxOpeningElement | ts.JsxSelfClosingElement> => {
  const openings: Array<ts.JsxOpeningElement | ts.JsxSelfClosingElement> = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sourceFile) === tagName
    ) {
      openings.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return openings;
};

const getAttribute = (
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  name: string,
  sourceFile: ts.SourceFile,
): ts.JsxAttribute | undefined =>
  node.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText(sourceFile) === name,
  );

const getStaticStringAttribute = (
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  name: string,
  sourceFile: ts.SourceFile,
): string | null => {
  const initializer = getAttribute(node, name, sourceFile)?.initializer;
  if (!initializer) return null;
  if (ts.isStringLiteral(initializer)) return initializer.text.trim();
  if (
    ts.isJsxExpression(initializer) &&
    initializer.expression &&
    ts.isStringLiteralLike(initializer.expression)
  ) {
    return initializer.expression.text.trim();
  }
  return null;
};

const hasExpressionAttribute = (
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  name: string,
  expectedExpression: string,
  sourceFile: ts.SourceFile,
): boolean => {
  const initializer = getAttribute(node, name, sourceFile)?.initializer;
  return Boolean(
    initializer &&
    ts.isJsxExpression(initializer) &&
    initializer.expression?.getText(sourceFile) === expectedExpression,
  );
};

test("every link-setting switch has an accessible name", async () => {
  const path = "src/components/documents/LinkSettingsPanel.tsx";
  const sourceFile = parseSource(path, await readSource(path));
  const switches = collectOpenings(sourceFile, "Switch");

  assert.ok(switches.length > 0, "expected link-setting switches");
  for (const switchNode of switches) {
    assert.ok(
      getStaticStringAttribute(switchNode, "aria-label", sourceFile),
      `unnamed Switch at line ${sourceFile.getLineAndCharacterOfPosition(switchNode.getStart(sourceFile)).line + 1}`,
    );
  }
});

test("ALC rule summaries are keyboard-operable disclosure controls", async () => {
  const path = "src/components/links/LinkAlcRulesDialog.tsx";
  const source = await readSource(path);
  const sourceFile = parseSource(path, source);
  const buttons = collectOpenings(sourceFile, "button");
  const disclosureButtons = buttons.filter((button) => {
    const text = button.getText(sourceFile);
    return (
      text.includes("toggleFolderExpanded") ||
      text.includes("toggleDocExpanded")
    );
  });

  assert.equal(disclosureButtons.length, 2);
  for (const button of disclosureButtons) {
    assert.equal(
      getStaticStringAttribute(button, "type", sourceFile),
      "button",
    );
    assert.ok(
      hasExpressionAttribute(button, "aria-expanded", "isExpanded", sourceFile),
    );
    assert.ok(getAttribute(button, "aria-controls", sourceFile)?.initializer);
  }

  assert.doesNotMatch(
    source,
    /<div[^>]*onClick=\{[\s\S]*?toggle(?:Folder|Doc)Expanded/,
  );
  assert.match(source, /id=\{`alc-folder-rule-\$\{rule\.folderId\}`\}/);
  assert.match(source, /id=\{`alc-document-rule-\$\{rule\.documentId\}`\}/);
});

test("ALC icon actions are named and its transactional footer stacks on narrow screens", async () => {
  const source = await readSource(
    "src/components/links/LinkAlcRulesDialog.tsx",
  );

  for (const label of [
    "Close advanced level control",
    "Cancel adding folder rule",
    "Cancel adding document rule",
  ]) {
    assert.match(source, new RegExp(`aria-label="${label}"`));
  }
  assert.match(
    source,
    /aria-label=\{`Remove folder access rule for \$\{folderRuleLabel\}`\}/,
  );
  assert.match(
    source,
    /aria-label=\{`Remove document access rule for \$\{documentRuleLabel\}`\}/,
  );

  assert.match(source, />\s*Cancel\s*<\/Button>/);
  assert.match(source, />\s*Apply Rules\s*<\/Button>/);
  assert.doesNotMatch(source, />\s*(?:Close|Done)\s*<\/Button>/);
  assert.match(
    source,
    /className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end"/,
  );
  assert.match(source, /className="h-11 w-full sm:w-auto/);
});

test("ALC close semantics discard the draft and only the final commit reaches parent rules", async () => {
  const source = await readSource(
    "src/components/links/LinkAlcRulesDialog.tsx",
  );

  assert.match(
    source,
    /<Dialog open=\{open\} onOpenChange=\{handleDialogOpenChange\}>/,
  );
  assert.match(source, /pendingDismissReasonRef\.current = "backdrop"/);
  assert.match(source, /onEscapeKeyDown=\{handleEscapeKeyDown\}/);
  assert.match(source, /dismissDialog\("close"\)/);
  assert.match(source, /dismissDialog\("cancel"\)/);
  assert.equal(
    source.match(/onRulesChange\(transition\.effect\.rules\)/g)?.length,
    1,
  );
});

test("ALC keeps a fixed-height scroll region and stable tabs on narrow screens", async () => {
  const [source, tabsSource] = await Promise.all([
    readSource("src/components/links/LinkAlcRulesDialog.tsx"),
    readSource("src/components/ui/tabs.tsx"),
  ]);

  assert.match(source, /h-\[85dvh\][^"\n]*max-h-\[85dvh\]/);
  assert.match(
    source,
    /className="flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6 sm:py-6"/,
  );
  assert.equal(
    source.match(/<TabsContent[\s\S]*?animateOnSwitch=\{false\}/g)?.length,
    3,
  );
  assert.match(source, /min-h-11[^"\n]*grid-cols-3/);
  assert.match(source, /\[overflow-wrap:anywhere\]/);
  assert.match(tabsSource, /animateOnSwitch = true/);
  assert.match(
    tabsSource,
    /initial=\{animateOnSwitch && hasSwitchedTab \? riseIn\.initial : false\}/,
  );
});

test("ALC email editors expose one label, invalid state, and described error", async () => {
  const source = await readSource(
    "src/components/links/LinkAlcRulesDialog.tsx",
  );

  assert.match(source, /<Label[\s\S]*?htmlFor=\{inputId\}/);
  assert.match(source, /<Input[\s\S]*?id=\{inputId\}/);
  assert.match(source, /aria-invalid=\{Boolean\(error\)\}/);
  assert.match(source, /aria-describedby=\{error \? errorId : undefined\}/);
  assert.match(source, /<p id=\{errorId\} role="alert"/);
  assert.match(source, /className="space-y-1\.5"/);
  assert.doesNotMatch(source, /focus-visible:ring-destructive/);
});

test("ALC overlap review is announced, keyboard-focused, and offers the specified choices", async () => {
  const source = await readSource(
    "src/components/links/LinkAlcRulesDialog.tsx",
  );

  assert.match(source, /aria-live="assertive"/);
  assert.match(source, /tabIndex=\{-1\}/);
  assert.match(source, /reviewHeadingRef/);
  assert.match(source, /\[reviewEntryId\]/);
  assert.doesNotMatch(
    source,
    /reviewHeadingRef\.current\?\.focus\(\);\s*}, \[review\]\)/,
  );
  assert.match(source, /Keep room-wide/);
  assert.match(source, /Limit to selected items/);
  assert.match(source, /min-h-11/);
});

test("ALC review blocks Apply until target metadata is ready and exposes recovery states", async () => {
  const source = await readSource(
    "src/components/links/LinkAlcRulesDialog.tsx",
  );

  assert.match(source, /getAlcReviewMetadataState/);
  assert.match(source, /Loading access locations/);
  assert.match(source, /Unable to verify access locations/);
  assert.match(source, /Some access locations are unavailable/);
  assert.match(source, />\s*Retry\s*<\/Button>/);
  assert.match(
    source,
    /disabled=\{Boolean\(review\) && reviewMetadata\.status !== "ready"\}/,
  );
});

test("ALC metadata queries are ordered, paginated, abortable, and delegated to the latest-load coordinator", async () => {
  const [source, loaderSource] = await Promise.all([
    readSource("src/components/links/LinkAlcRulesDialog.tsx"),
    readSource("src/modules/public-links/alcMetadataLoader.ts"),
  ]);

  assert.match(source, /loadCompleteAlcContentMetadata/);
  assert.match(source, /createLatestAlcMetadataLoadCoordinator/);
  assert.match(loaderSource, /collectPaginatedAlcMetadata/);
  assert.equal(
    source.match(
      /\.order\("id", \{ ascending: true \}\)[\s\S]*?\.range\(from, to\)[\s\S]*?\.abortSignal\(signal\)/g,
    )?.length,
    2,
  );
  assert.match(source, /metadataState\.dataRoomId === dataRoomId/);
  assert.match(source, /metadataLoadCoordinator\.cancel\(\)/);
  assert.match(loaderSource, /Promise\.all\(/);
  assert.equal(
    source.match(
      /onSuccess: \(\{ folders, documents \}\) => \{\s*setMetadataState\(/g,
    )?.length,
    1,
  );
});

test("ALC compact destructive controls meet the 44px touch target", async () => {
  const source = await readSource(
    "src/components/links/LinkAlcRulesDialog.tsx",
  );

  assert.match(source, /h-11 w-11[\s\S]*?aria-label=\{`Remove \$\{email\}`\}/);
  assert.equal(source.match(/<AlertDialogCancel className="h-11"/g)?.length, 2);
  assert.equal(
    source.match(/<AlertDialogAction[\s\S]*?className="h-11"/g)?.length,
    2,
  );
});

test("ALC existing-rule toolbars stay sticky with one add action and a visible count", async () => {
  const source = await readSource(
    "src/components/links/LinkAlcRulesDialog.tsx",
  );

  assert.equal(source.match(/Existing Rules \(/g)?.length, 2);
  assert.equal(source.match(/\s+Add Rule\s+<\/Button>/g)?.length, 2);
  assert.equal(source.match(/sticky top-0/g)?.length, 2);
  assert.equal(
    source.match(/-mx-4[^"\n]*px-4[^"\n]*sm:-mx-6 sm:px-6/g)?.length,
    2,
  );
});

test("the link save guard opens ALC conflict review before persistence", async () => {
  const [manager, panel] = await Promise.all([
    readSource("src/components/links/LinksManagerCard.tsx"),
    readSource("src/components/documents/LinkSettingsPanel.tsx"),
  ]);

  const guardIndex = manager.indexOf("prepareAlcRulesApply(alcRules)");
  const savingIndex = manager.indexOf("setIsSaving(true)", guardIndex);
  assert.ok(guardIndex >= 0, "expected defensive ALC overlap guard");
  assert.ok(
    savingIndex > guardIndex,
    "guard must run before persistence starts",
  );
  assert.match(
    manager,
    /setAlcConflictReviewRequest\(\(value\) => value \+ 1\)/,
  );
  assert.match(panel, /alcConflictReviewRequest/);
  assert.match(panel, /consumeAlcReviewRequest/);
  assert.match(panel, /alcReviewRequestCursorRef/);
  assert.match(panel, /if \(!consumption\.shouldOpen\) return;/);
});
