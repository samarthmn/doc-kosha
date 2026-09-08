import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const TASK_8_FILES = [
  "src/components/pages/SettingsClient.tsx",
  "src/components/settings/AppearanceSettings.tsx",
  "src/components/settings/ProfileSettings.tsx",
  "src/components/settings/PublicLinksSettings.tsx",
  "src/components/settings/PrivacySettings.tsx",
  "src/components/settings/NotificationSettings.tsx",
  "src/components/settings/SubscriptionUsage.tsx",
  "src/modules/document-versioning/components/DocumentVersioningSettings.tsx",
  "src/components/pages/BrandingSettingsClient.tsx",
  "src/modules/custom-domains/CustomDomainSection.tsx",
  "src/components/branding/WatermarkTemplatesManager.tsx",
  "src/components/nda/NdaTemplatesPage.tsx",
  "src/modules/user-groups/UserGroupsPage.tsx",
  "src/modules/testimonials/TestimonialForm.tsx",
  "src/components/workspace/WorkspaceMemberAccessFields.tsx",
  "src/components/billing/UsageStats.tsx",
  "src/components/billing/PlanPickerSection.tsx",
  "src/components/billing/PlanCard.tsx",
  "src/components/billing/BillingIntervalToggle.tsx",
] as const;

type StaticValue = string | boolean;

interface PrivacyExpectation {
  path: (typeof TASK_8_FILES)[number];
  tagName: "Card" | "SurfaceCard" | "DialogContent";
  descendantTokens: string[];
}

const PRIVACY_EXPECTATIONS: PrivacyExpectation[] = [
  {
    path: "src/components/branding/WatermarkTemplatesManager.tsx",
    tagName: "DialogContent",
    descendantTokens: [
      'data-guide="branding-watermark-controls"',
      'data-guide="branding-watermark-preview"',
    ],
  },
  {
    path: "src/components/pages/BrandingSettingsClient.tsx",
    tagName: "SurfaceCard",
    descendantTokens: [
      'data-guide="branding-identity-form"',
      "triggerLogoPicker",
      "logoFile.name",
    ],
  },
  {
    path: "src/components/pages/BrandingSettingsClient.tsx",
    tagName: "DialogContent",
    descendantTokens: ["BrandingHeader", 'title="Branding header preview"'],
  },
  {
    path: "src/components/nda/NdaTemplatesPage.tsx",
    tagName: "DialogContent",
    descendantTokens: ["EditorContent", "template-name"],
  },
  {
    path: "src/components/nda/NdaTemplatesPage.tsx",
    tagName: "DialogContent",
    descendantTokens: ["nda-preview-html", "dangerouslySetInnerHTML"],
  },
  {
    path: "src/modules/testimonials/TestimonialForm.tsx",
    tagName: "SurfaceCard",
    descendantTokens: ['alt="Submitted headshot"', "Headshot uploaded"],
  },
  {
    path: "src/modules/testimonials/TestimonialForm.tsx",
    tagName: "SurfaceCard",
    descendantTokens: ['id="testimonial-headshot"', 'alt="Headshot preview"'],
  },
];

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

const getStaticValues = (node: ts.Node | undefined): StaticValue[] => {
  if (!node) return [];
  if (ts.isJsxExpression(node)) return getStaticValues(node.expression);
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (node.kind === ts.SyntaxKind.TrueKeyword) return [true];
  if (node.kind === ts.SyntaxKind.FalseKeyword) return [false];
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return getStaticValues(node.expression);
  }
  if (ts.isConditionalExpression(node)) {
    return [
      ...getStaticValues(node.whenTrue),
      ...getStaticValues(node.whenFalse),
    ];
  }
  return [];
};

const getAttribute = (
  attributes: ts.JsxAttributes,
  attributeName: string,
  sourceFile: ts.SourceFile,
): ts.JsxAttribute | undefined =>
  attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) &&
      property.name.getText(sourceFile) === attributeName,
  );

const isSemanticallyTrue = (
  attributes: ts.JsxAttributes,
  attributeName: string,
  sourceFile: ts.SourceFile,
): boolean => {
  const attribute = getAttribute(attributes, attributeName, sourceFile);
  if (!attribute) return false;
  if (!attribute.initializer) return true;
  const values = getStaticValues(attribute.initializer);
  return (
    values.length > 0 &&
    values.every((value) => value === true || value === "true")
  );
};

const hasClassToken = (
  attributes: ts.JsxAttributes,
  token: string,
  sourceFile: ts.SourceFile,
): boolean => {
  const attribute = getAttribute(attributes, "className", sourceFile);
  if (!attribute?.initializer) return false;
  const classExpression = attribute.initializer.getText(sourceFile);
  return new RegExp(`(?:^|[^\\w-])${token}(?:$|[^\\w-])`).test(classExpression);
};

const getOpeningElement = (node: ts.JsxElement): ts.JsxOpeningElement =>
  node.openingElement;

const getTagName = (
  openingElement: ts.JsxOpeningLikeElement,
  sourceFile: ts.SourceFile,
): string => openingElement.tagName.getText(sourceFile);

const getElementOpening = (
  node: ts.JsxElement | ts.JsxSelfClosingElement,
): ts.JsxOpeningLikeElement =>
  ts.isJsxElement(node) ? node.openingElement : node;

const getDirectElementChildren = (
  node: ts.JsxElement,
): Array<ts.JsxElement | ts.JsxSelfClosingElement> =>
  node.children.filter(
    (child): child is ts.JsxElement | ts.JsxSelfClosingElement =>
      ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child),
  );

const findJsxElements = (
  sourceFile: ts.SourceFile,
  predicate: (node: ts.JsxElement) => boolean,
): ts.JsxElement[] => {
  const matches: ts.JsxElement[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) && predicate(node)) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return matches;
};

const auditPhosphorIcons = (path: string, source: string): string[] => {
  const sourceFile = parseSource(path, source);
  const iconNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@phosphor-icons/react"
    ) {
      continue;
    }
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
    for (const element of namedBindings.elements) {
      iconNames.add(element.name.text);
    }
  }

  if (path.endsWith("SettingsClient.tsx")) iconNames.add("Icon");
  if (path.endsWith("AppearanceSettings.tsx")) iconNames.add("ThemeIcon");

  const violations: string[] = [];
  const formatViolation = (node: ts.Node, message: string): string => {
    const position = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    return `${path}:${position.line + 1} ${message}`;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = getTagName(node, sourceFile);
      if (
        iconNames.has(tagName) &&
        !isSemanticallyTrue(node.attributes, "aria-hidden", sourceFile)
      ) {
        violations.push(formatViolation(node, `<${tagName}>`));
      }
    }
    if (
      ts.isJsxElement(node) &&
      getTagName(node.openingElement, sourceFile) === "HoverCardTrigger" &&
      isSemanticallyTrue(node.openingElement.attributes, "asChild", sourceFile)
    ) {
      const iconDescendants: ts.JsxOpeningLikeElement[] = [];
      const findIcons = (descendant: ts.Node): void => {
        if (
          (ts.isJsxOpeningElement(descendant) ||
            ts.isJsxSelfClosingElement(descendant)) &&
          iconNames.has(getTagName(descendant, sourceFile))
        ) {
          iconDescendants.push(descendant);
        }
        ts.forEachChild(descendant, findIcons);
      };
      node.children.forEach(findIcons);

      if (iconDescendants.length > 0) {
        const directChildren = getDirectElementChildren(node);
        const triggerChild = directChildren[0];
        const triggerOpening = triggerChild
          ? getElementOpening(triggerChild)
          : undefined;
        const triggerTag = triggerOpening
          ? getTagName(triggerOpening, sourceFile)
          : "";
        const triggerType = triggerOpening
          ? getAttribute(triggerOpening.attributes, "type", sourceFile)
              ?.initializer
          : undefined;
        const accessibleName = triggerOpening
          ? getAttribute(triggerOpening.attributes, "aria-label", sourceFile)
              ?.initializer
          : undefined;
        const hasNamedFocusableButton =
          (triggerTag === "Button" || triggerTag === "button") &&
          getStaticValues(triggerType).includes("button") &&
          getStaticValues(accessibleName).some(
            (value) => typeof value === "string" && value.trim().length > 0,
          );

        if (!hasNamedFocusableButton) {
          violations.push(
            formatViolation(
              node.openingElement,
              "<HoverCardTrigger asChild> wraps an icon without a named focusable button",
            ),
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
};

test("sensitive Task 8 surfaces use complete PostHog-blocked wrappers", async () => {
  const sources = new Map<string, string>();

  for (const expectation of PRIVACY_EXPECTATIONS) {
    let source = sources.get(expectation.path);
    if (!source) {
      source = await readSource(expectation.path);
      sources.set(expectation.path, source);
    }
    const sourceFile = parseSource(expectation.path, source);
    const matchingWrappers = findJsxElements(sourceFile, (node) => {
      const openingElement = getOpeningElement(node);
      if (getTagName(openingElement, sourceFile) !== expectation.tagName) {
        return false;
      }
      if (
        !hasClassToken(
          openingElement.attributes,
          "ph-no-capture",
          sourceFile,
        ) ||
        !isSemanticallyTrue(
          openingElement.attributes,
          "data-ph-no-capture",
          sourceFile,
        )
      ) {
        return false;
      }
      const wrapperSource = node.getText(sourceFile);
      return expectation.descendantTokens.every((token) =>
        wrapperSource.includes(token),
      );
    });

    assert.equal(
      matchingWrappers.length,
      1,
      `${expectation.path} needs one complete ${expectation.tagName} privacy wrapper containing ${expectation.descendantTokens.join(", ")}`,
    );
  }
});

test("appearance cards keep focus visible while clipping only the preview", async () => {
  const path = "src/components/settings/AppearanceSettings.tsx";
  const source = await readSource(path);
  const sourceFile = parseSource(path, source);
  const themeCards = findJsxElements(sourceFile, (node) => {
    const openingElement = getOpeningElement(node);
    return (
      getTagName(openingElement, sourceFile) === "Card" &&
      getAttribute(openingElement.attributes, "className", sourceFile)
        ?.getText(sourceFile)
        .includes("group relative") === true
    );
  });

  assert.equal(themeCards.length, 1, "expected the theme-selection Card");
  const openingElement = getOpeningElement(themeCards[0]);
  const className =
    getAttribute(openingElement.attributes, "className", sourceFile)?.getText(
      sourceFile,
    ) ?? "";

  assert.match(className, /focus-within:ring-2/);
  assert.doesNotMatch(className, /overflow-hidden/);
  assert.match(
    themeCards[0].getText(sourceFile),
    /className="flex w-full overflow-hidden rounded/,
  );
});

test("every Task 8 Phosphor icon is semantically hidden from assistive tech", async () => {
  const violations: string[] = [];
  for (const path of TASK_8_FILES) {
    violations.push(...auditPhosphorIcons(path, await readSource(path)));
  }
  assert.deepEqual(violations, []);
});

test("the icon audit rejects aria-hidden={false}", () => {
  const fixture = `
    import { Eye } from "@phosphor-icons/react";
    export const Fixture = () => <Eye aria-hidden={false} />;
  `;
  assert.deepEqual(auditPhosphorIcons("negative-fixture.tsx", fixture), [
    "negative-fixture.tsx:3 <Eye>",
  ]);
});

test("NDA structure help stays visible without a hover-only trigger", async () => {
  const path = "src/components/nda/NdaTemplatesPage.tsx";
  const source = await readSource(path);
  const sourceFile = parseSource(path, source);
  const descriptions = findJsxElements(sourceFile, (node) => {
    const openingElement = getOpeningElement(node);
    return (
      getTagName(openingElement, sourceFile) === "DialogDescription" &&
      node
        .getText(sourceFile)
        .includes("The template editor controls only the body clauses") &&
      node
        .getText(sourceFile)
        .includes("Those sections are added automatically")
    );
  });

  assert.equal(descriptions.length, 1);
  assert.doesNotMatch(source, /HoverCardTrigger|About NDA template structure/);
});

test("the icon audit rejects a hidden SVG used as a bare asChild trigger", () => {
  const fixture = `
    import { Info } from "@phosphor-icons/react";
    export const Fixture = () => (
      <HoverCardTrigger asChild>
        <Info aria-hidden />
      </HoverCardTrigger>
    );
  `;
  const violations = auditPhosphorIcons(
    "interactive-negative-fixture.tsx",
    fixture,
  );
  assert.equal(violations.length, 1);
  assert.match(
    violations[0],
    /HoverCardTrigger asChild.*without a named focusable button/,
  );
});

test("Task 8 copy remains state-accurate and neutral", async () => {
  const domainSource = await readSource(
    "src/modules/custom-domains/CustomDomainSection.tsx",
  );
  assert.match(domainSource, /Branded delivery host/);
  assert.doesNotMatch(domainSource, /Verified delivery host/);

  const subscriptionSource = await readSource(
    "src/components/settings/SubscriptionUsage.tsx",
  );
  assert.match(
    subscriptionSource,
    /Switch plans and billing interval without leaving settings\./,
  );
  assert.doesNotMatch(subscriptionSource, /faster,\s+in-context flow/);
});
