import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const readSource = async (path: string): Promise<string> =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

/**
 * Collects every `<AlertDialogAction>` opening tag and records whether it
 * explicitly declares `variant="destructive"`.
 *
 * This is parsed rather than regex-matched on purpose: a textual
 * `/<AlertDialogAction\b[\s\S]*?>/` stops at the first `>` in the tag, which
 * may be the `>` of an arrow function in an earlier prop (`onClick={() => …}`).
 * That made the audit prop-order sensitive — moving `variant="destructive"`
 * after `onClick` failed perfectly correct code. The AST sees the whole
 * attribute list regardless of ordering or formatting.
 */
const collectAlertDialogActions = (
  path: string,
  source: string,
): { isExplicitlyDestructive: boolean }[] => {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const actions: { isExplicitlyDestructive: boolean }[] = [];

  const isDestructiveVariant = (attribute: ts.JsxAttribute): boolean => {
    if (attribute.name.getText(sourceFile) !== "variant") return false;
    const { initializer } = attribute;
    if (!initializer) return false;
    if (ts.isStringLiteral(initializer)) {
      return initializer.text === "destructive";
    }
    if (ts.isJsxExpression(initializer)) {
      const { expression } = initializer;
      return Boolean(
        expression &&
        ts.isStringLiteralLike(expression) &&
        expression.text === "destructive",
      );
    }
    return false;
  };

  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sourceFile) === "AlertDialogAction"
    ) {
      actions.push({
        isExplicitlyDestructive: node.attributes.properties.some(
          (property) =>
            ts.isJsxAttribute(property) && isDestructiveVariant(property),
        ),
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return actions;
};

test("the application uses Inter through the semantic sans token", async () => {
  const [layout, mainLayout, css] = await Promise.all([
    readSource("src/app/layout.tsx"),
    readSource("src/components/layouts/MainLayout.tsx"),
    readSource("src/app/globals.css"),
  ]);

  assert.doesNotMatch(layout, /contents font-sans/);
  assert.match(layout, /<MainLayout>\{children\}<\/MainLayout>/);
  assert.match(mainLayout, /Inter/);
  assert.doesNotMatch(mainLayout, /Mulish|font-mulish|mulish\./);
  assert.match(
    mainLayout,
    /<body[\s\S]*?className=\{`\$\{inter\.variable\}[^`]*font-sans[^`]*`\}/,
  );
  assert.match(css, /--font-sans:\s*var\(--font-inter\)/);
});

test("every persisted theme exposes raised, action, and chart surfaces", async () => {
  const css = await readSource("src/app/globals.css");
  const selectors = [
    ":root",
    ".light",
    ".dark",
    ".copper",
    ".forest",
    ".lavender",
    ".midnight",
    ".ocean",
    ".sunset",
  ];

  for (const selector of selectors) {
    const start = css.indexOf(selector);
    assert.notEqual(start, -1, `missing ${selector}`);
    const block = css.slice(start, css.indexOf("}", start) + 1);
    assert.match(block, /--card:/, `${selector} must define --card`);
    assert.match(block, /--primary:/, `${selector} must define --primary`);
    assert.match(block, /--chart-1:/, `${selector} must define --chart-1`);
  }
});

test("all nine saved theme identifiers keep their selector and persistence contract", async () => {
  const [themeTypes, appearance, store, storage, initScript, applier] =
    await Promise.all([
      readSource("src/types/theme.ts"),
      readSource("src/components/settings/AppearanceSettings.tsx"),
      readSource("src/providers/globalStoreProvider.ts"),
      readSource("src/types/storage.ts"),
      readSource("src/components/theme/themeInitScript.ts"),
      readSource("src/components/theme/ThemeClassApplier.tsx"),
    ]);
  const identifiers = [
    "system",
    "light",
    "dark",
    "copper",
    "forest",
    "lavender",
    "midnight",
    "ocean",
    "sunset",
  ] as const;

  for (const identifier of identifiers) {
    assert.match(
      themeTypes,
      new RegExp(`value: "${identifier}"`),
      `missing saved theme ${identifier}`,
    );
    assert.match(
      appearance,
      new RegExp(`\\b${identifier}: \\[`),
      `missing ${identifier} selector preview`,
    );
  }

  assert.match(storage, /GlobalStore = "dockosha-global-store"/);
  assert.match(store, /storage: createJSONStorage\(\(\) => localStorage\)/);
  assert.match(store, /partialize:[\s\S]*theme: state\.theme/);
  assert.match(initScript, /window\.localStorage\.getItem/);
  assert.match(initScript, /stored\.state\.theme/);
  assert.match(applier, /pathname\?\.startsWith\("\/d\/"\)/);
  assert.match(applier, /pathname\?\.startsWith\("\/r\/"\)/);
  assert.match(applier, /isPublicRoute \? "system" : theme/);
});

test("the light theme preview is declaratively scoped without a post-paint CSSOM copy", async () => {
  const [css, appearance] = await Promise.all([
    readSource("src/app/globals.css"),
    readSource("src/components/settings/AppearanceSettings.tsx"),
  ]);

  assert.match(
    css,
    /:root,\s*\.light\s*\{/,
    "the persisted .light class and nested theme previews must share the light palette",
  );
  assert.match(appearance, /light:\s*\["light"\]/);
  assert.doesNotMatch(appearance, /document\.styleSheets|readRootPalette/);
});

test("unbounded loading utilities stop for reduced-motion users", async () => {
  const css = await readSource("src/app/globals.css");
  const reducedMotionStart = css.indexOf(
    "@media (prefers-reduced-motion: reduce)",
  );
  assert.notEqual(reducedMotionStart, -1);

  const reducedMotionBlock = css.slice(
    reducedMotionStart,
    css.indexOf("@keyframes fade-in-up", reducedMotionStart),
  );
  for (const utility of [
    ".animate-spin",
    ".animate-pulse",
    ".animate-bounce",
    ".animate-ping",
  ]) {
    assert.match(
      reducedMotionBlock,
      new RegExp(`\\\\?${utility.replace(".", "\\.")}`),
      `${utility} must stop when reduced motion is requested`,
    );
  }
  assert.match(reducedMotionBlock, /animation:\s*none\s*!important/);
});

test("the homepage opts into the full display hero scale", async () => {
  const [hero, landingPage] = await Promise.all([
    readSource("src/components/marketing/MarketingHero.tsx"),
    readSource("src/components/marketing/pages/LandingPage.tsx"),
  ]);

  assert.match(hero, /titleScale = "display-sm"/);
  assert.match(hero, /display:\s*"[^"]*5\.5rem/);
  assert.match(
    landingPage,
    /titleScale="display"/,
    "the homepage must opt into the homepage-only display scale",
  );
});

test("authenticated navigation renders the canonical icon from navItems", async () => {
  const [navConfig, sidebar, mobileHeader, bottomTabs] = await Promise.all([
    readSource("src/components/ui/nav-config.ts"),
    readSource("src/components/ui/sidebar.tsx"),
    readSource("src/components/ui/mobile-header.tsx"),
    readSource("src/components/ui/bottom-tab-bar.tsx"),
  ]);

  assert.match(navConfig, /icon:\s*Icon/);
  for (const shell of [sidebar, mobileHeader, bottomTabs]) {
    assert.doesNotMatch(shell, /shellNavIcons/);
  }
  assert.match(sidebar, /const Icon = item\.icon/);
  assert.match(mobileHeader, /const Icon = item\.icon/);
  assert.match(bottomTabs, /const Icon = tab\.icon/);
});

test("authentication support copy uses the active palette token", async () => {
  const authLayout = await readSource(
    "src/components/auth/AuthGlassLayout.tsx",
  );

  assert.doesNotMatch(authLayout, /dark:text-slate-400/);
  assert.match(authLayout, /text-muted-foreground/);
});

test("shared primitives use outline-first actions and compact surfaces", async () => {
  const [button, card, dialog, sheet] = await Promise.all([
    readSource("src/components/ui/button.tsx"),
    readSource("src/components/ui/card.tsx"),
    readSource("src/components/ui/dialog.tsx"),
    readSource("src/components/ui/sheet.tsx"),
  ]);

  assert.match(button, /border-primary/);
  assert.match(button, /bg-primary\/10/);
  assert.match(card, /rounded-lg/);
  assert.match(dialog, /rounded-\[14px\]/);
  assert.match(dialog, /motion-reduce:animate-none/);
  assert.match(sheet, /motion-reduce:animate-none/);
  assert.match(sheet, /motion-reduce:transition-none/);
});

test("every shared overlay primitive disables state-driven motion", async () => {
  const overlayPaths = [
    "src/components/ui/select.tsx",
    "src/components/ui/alert-dialog.tsx",
    "src/components/ui/popover.tsx",
    "src/components/ui/dropdown-menu.tsx",
    "src/components/ui/hover-card.tsx",
    "src/components/ui/context-menu.tsx",
  ];
  const overlays = await Promise.all(overlayPaths.map(readSource));

  overlays.forEach((source, index) => {
    assert.match(
      source,
      /motion-reduce:animate-none/,
      `${overlayPaths[index]} must disable state animation`,
    );
    assert.match(
      source,
      /motion-reduce:transition-none/,
      `${overlayPaths[index]} must disable state transitions`,
    );
  });

  const alertDialogMotionGuards =
    overlays[1]?.match(/motion-reduce:animate-none/g) ?? [];
  assert.ok(
    alertDialogMotionGuards.length >= 2,
    "alert dialog overlay and content both need reduced-motion guards",
  );
});

test("alert dialog styles only explicit destructive confirmations as destructive", async () => {
  const destructiveConsumers = [
    ["src/modules/user-groups/UserGroupsPage.tsx", 1],
    ["src/modules/custom-domains/CustomDomainSection.tsx", 1],
    ["src/components/branding/WatermarkTemplatesManager.tsx", 1],
    ["src/components/settings/ProfileSettings.tsx", 3],
    ["src/components/settings/SubscriptionUsage.tsx", 1],
    ["src/components/links/LinkAlcRulesDialog.tsx", 2],
    ["src/components/links/LinksManagerCard.tsx", 1],
    ["src/components/nda/NdaTemplatesPage.tsx", 1],
    ["src/components/pages/DocumentsClient.tsx", 2],
    ["src/components/pages/DataRoomsClient.tsx", 1],
    ["src/components/documents/LinkSettingsPanel.tsx", 2],
  ] as const;

  const [alertDialog, ...destructiveSources] = await Promise.all([
    readSource("src/components/ui/alert-dialog.tsx"),
    ...destructiveConsumers.map(([path]) => readSource(path)),
  ]);

  assert.match(
    alertDialog,
    /buttonVariants\(\{\s*variant,\s*size,\s*className\s*\}\)/,
  );
  assert.doesNotMatch(alertDialog, /variant:\s*variant \?\? "destructive"/);

  destructiveConsumers.forEach(([path, expectedCount], index) => {
    const actions = collectAlertDialogActions(
      path,
      destructiveSources[index] ?? "",
    );
    const explicitDestructiveActions = actions.filter(
      (action) => action.isExplicitlyDestructive,
    );

    assert.equal(actions.length, expectedCount, `${path} action audit changed`);
    assert.equal(
      explicitDestructiveActions.length,
      expectedCount,
      `${path} must explicitly mark every destructive action`,
    );
  });

  // The audit must key on the attribute list, not on prop ordering: a `>` from
  // an arrow-function prop must not truncate the tag, and `variant` may appear
  // anywhere in the list or as a JSX expression.
  const orderingFixture = collectAlertDialogActions(
    "fixtures/AlertDialogActionOrdering.tsx",
    `
      const fixture = (
        <>
          <AlertDialogAction onClick={() => remove()} variant="destructive">
            Delete
          </AlertDialogAction>
          <AlertDialogAction
            className="w-full"
            variant={"destructive"}
            onClick={() => {
              archive();
            }}
          >
            Archive
          </AlertDialogAction>
          <AlertDialogAction onClick={() => dismiss()}>Got it</AlertDialogAction>
          <AlertDialogAction variant={variant}>Dynamic</AlertDialogAction>
        </>
      );
    `,
  );
  assert.equal(orderingFixture.length, 4);
  assert.deepEqual(
    orderingFixture.map((action) => action.isExplicitlyDestructive),
    [true, true, false, false],
  );
});
