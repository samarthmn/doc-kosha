import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const TASK_7_FILES = [
  "src/components/pages/DataRoomsClient.tsx",
  "src/components/pages/DataRoomPageClient.tsx",
  "src/components/pages/DataRoomDocumentsRouteClient.tsx",
  "src/components/pages/DataRoomLinksManager.tsx",
  "src/components/pages/DataRoomShareClient.tsx",
  "src/components/pages/DataRoomShareRouteClient.tsx",
  "src/components/pages/DataRoomAnalyticsClient.tsx",
  "src/components/pages/DataRoomAnalyticsRouteClient.tsx",
  "src/components/pages/DataRoomAccessClient.tsx",
  "src/components/pages/DataRoomAuditLogClient.tsx",
] as const;

const FORBIDDEN_KICKER_TEXT = new Set([
  "Workspace access",
  "Recipient agreements",
  "Selected range",
  "Files",
  "Room",
  "File-level signals",
  "Known recipients",
  "Room signals",
  "Room files",
  "Structured activity",
  "Room links",
]);

const FORBIDDEN_LANDMARK_LABELS = new Set([
  "Data room internal audit activity",
  "Data room share links",
]);

/**
 * Attributes whose static values render as visible or announced copy. The
 * forbidden-copy scan must cover these as well as JSX children, otherwise the
 * same banned string reintroduced as a prop (`<StatCard title="Room signals" />`)
 * slips through unnoticed.
 */
const COPY_ATTRIBUTE_NAMES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "caption",
  "cardTitle",
  "description",
  "emptyDescription",
  "emptyLabel",
  "emptyMessage",
  "emptyTitle",
  "eyebrow",
  "heading",
  "helperText",
  "kicker",
  "label",
  "message",
  "placeholder",
  "sectionLabel",
  "subheading",
  "subtitle",
  "summary",
  "text",
  "title",
  "tooltip",
]);

type StaticValue = string | boolean | number | null;

interface SourceAudit {
  iconViolations: string[];
  motionViolations: string[];
  semanticViolations: string[];
}

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

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

const combineStrings = (
  left: string[],
  right: string[],
  separator = "",
): string[] => {
  const combined: string[] = [];
  for (const leftValue of left) {
    for (const rightValue of right) {
      combined.push(`${leftValue}${separator}${rightValue}`);
      if (combined.length >= 64) return unique(combined);
    }
  }
  return unique(combined);
};

const unwrapExpression = (node: ts.Node): ts.Node => {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return unwrapExpression(node.expression);
  }
  return node;
};

const getStaticValues = (
  input: ts.Node | undefined,
  sourceFile: ts.SourceFile,
): StaticValue[] => {
  if (!input) return [];
  const node = unwrapExpression(input);

  if (ts.isJsxExpression(node)) {
    return getStaticValues(node.expression, sourceFile);
  }
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isNumericLiteral(node)) return [Number(node.text)];
  if (node.kind === ts.SyntaxKind.TrueKeyword) return [true];
  if (node.kind === ts.SyntaxKind.FalseKeyword) return [false];
  if (node.kind === ts.SyntaxKind.NullKeyword) return [null];

  if (ts.isTemplateExpression(node)) {
    let variants = [node.head.text];
    for (const span of node.templateSpans) {
      const expressionValues = getStaticValues(span.expression, sourceFile).map(
        String,
      );
      if (expressionValues.length === 0) return [];
      variants = combineStrings(variants, expressionValues);
      variants = variants.map((value) => `${value}${span.literal.text}`);
    }
    return unique(variants);
  }

  if (ts.isConditionalExpression(node)) {
    return unique([
      ...getStaticValues(node.whenTrue, sourceFile),
      ...getStaticValues(node.whenFalse, sourceFile),
    ]);
  }

  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (operator === ts.SyntaxKind.PlusToken) {
      const left = getStaticValues(node.left, sourceFile);
      const right = getStaticValues(node.right, sourceFile);
      if (left.length === 0 || right.length === 0) return [];
      return unique(
        left.flatMap((leftValue) =>
          right.map(
            (rightValue) => `${String(leftValue)}${String(rightValue)}`,
          ),
        ),
      );
    }
    if (
      operator === ts.SyntaxKind.AmpersandAmpersandToken ||
      operator === ts.SyntaxKind.BarBarToken ||
      operator === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return unique([
        ...getStaticValues(node.left, sourceFile),
        ...getStaticValues(node.right, sourceFile),
      ]);
    }
  }

  return [];
};

const getPropertyName = (
  name: ts.PropertyName,
  sourceFile: ts.SourceFile,
): string | null => {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) {
    const values = getStaticValues(name.expression, sourceFile);
    return values.length === 1 ? String(values[0]) : null;
  }
  return null;
};

const getAttributeValues = (
  attributes: ts.JsxAttributes,
  attributeName: string,
  sourceFile: ts.SourceFile,
): StaticValue[] => {
  const values: StaticValue[] = [];

  for (const property of attributes.properties) {
    if (
      ts.isJsxAttribute(property) &&
      property.name.getText(sourceFile) === attributeName
    ) {
      if (!property.initializer) {
        values.push(true);
      } else {
        values.push(...getStaticValues(property.initializer, sourceFile));
      }
      continue;
    }

    if (
      ts.isJsxSpreadAttribute(property) &&
      ts.isObjectLiteralExpression(unwrapExpression(property.expression))
    ) {
      const objectLiteral = unwrapExpression(
        property.expression,
      ) as ts.ObjectLiteralExpression;
      for (const member of objectLiteral.properties) {
        if (
          ts.isPropertyAssignment(member) &&
          getPropertyName(member.name, sourceFile) === attributeName
        ) {
          values.push(...getStaticValues(member.initializer, sourceFile));
        }
      }
    }
  }

  return unique(values);
};

const getClassVariants = (
  input: ts.Node | undefined,
  sourceFile: ts.SourceFile,
): string[] => {
  if (!input) return [""];
  const node = unwrapExpression(input);

  if (ts.isJsxExpression(node)) {
    return getClassVariants(node.expression, sourceFile);
  }
  if (ts.isStringLiteralLike(node)) return [node.text];

  if (ts.isTemplateExpression(node)) {
    const staticValues = getStaticValues(node, sourceFile).map(String);
    return staticValues.length > 0 ? staticValues : [""];
  }

  if (ts.isConditionalExpression(node)) {
    return unique([
      ...getClassVariants(node.whenTrue, sourceFile),
      ...getClassVariants(node.whenFalse, sourceFile),
    ]);
  }

  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (operator === ts.SyntaxKind.PlusToken) {
      const staticValues = getStaticValues(node, sourceFile).map(String);
      return staticValues.length > 0 ? staticValues : [""];
    }
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
      return unique(["", ...getClassVariants(node.right, sourceFile)]);
    }
    if (
      operator === ts.SyntaxKind.BarBarToken ||
      operator === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return unique([
        ...getClassVariants(node.left, sourceFile),
        ...getClassVariants(node.right, sourceFile),
      ]);
    }
  }

  if (ts.isCallExpression(node)) {
    let variants = [""];
    for (const argument of node.arguments) {
      variants = combineStrings(
        variants,
        getClassVariants(argument, sourceFile),
        " ",
      );
    }
    return variants.map((value) => value.trim());
  }

  if (ts.isArrayLiteralExpression(node)) {
    let variants = [""];
    for (const element of node.elements) {
      variants = combineStrings(
        variants,
        getClassVariants(element, sourceFile),
        " ",
      );
    }
    return variants.map((value) => value.trim());
  }

  const staticValues = getStaticValues(node, sourceFile).map(String);
  return staticValues.length > 0 ? staticValues : [""];
};

const getAttributeClassVariants = (
  attributes: ts.JsxAttributes,
  sourceFile: ts.SourceFile,
): string[] => {
  const variants: string[] = [];

  for (const property of attributes.properties) {
    if (
      ts.isJsxAttribute(property) &&
      property.name.getText(sourceFile) === "className"
    ) {
      variants.push(...getClassVariants(property.initializer, sourceFile));
      continue;
    }

    if (
      ts.isJsxSpreadAttribute(property) &&
      ts.isObjectLiteralExpression(unwrapExpression(property.expression))
    ) {
      const objectLiteral = unwrapExpression(
        property.expression,
      ) as ts.ObjectLiteralExpression;
      for (const member of objectLiteral.properties) {
        if (
          ts.isPropertyAssignment(member) &&
          getPropertyName(member.name, sourceFile) === "className"
        ) {
          variants.push(...getClassVariants(member.initializer, sourceFile));
        }
      }
    }
  }

  return variants.length > 0 ? unique(variants) : [""];
};

const combineJsxText = (current: string[], next: string[]): string[] =>
  combineStrings(current, next);

const getJsxTextVariants = (
  children: readonly ts.JsxChild[],
  sourceFile: ts.SourceFile,
): string[] => {
  let variants = [""];

  for (const child of children) {
    let childVariants: string[] = [""];
    if (ts.isJsxText(child)) {
      childVariants = [child.text];
    } else if (ts.isJsxExpression(child)) {
      childVariants = getStaticValues(child.expression, sourceFile).filter(
        (value): value is string => typeof value === "string",
      );
      if (childVariants.length === 0) childVariants = [""];
    } else if (ts.isJsxElement(child)) {
      childVariants = getJsxTextVariants(child.children, sourceFile);
    } else if (ts.isJsxFragment(child)) {
      childVariants = getJsxTextVariants(child.children, sourceFile);
    }
    variants = combineJsxText(variants, childVariants);
  }

  return unique(variants);
};

const normalizeText = (value: string): string =>
  value.split(/\s+/u).filter(Boolean).join(" ").trim();

const getPhosphorIconNames = (sourceFile: ts.SourceFile): Set<string> => {
  const iconNames = new Set<string>();

  sourceFile.forEachChild((node) => {
    if (
      !ts.isImportDeclaration(node) ||
      !ts.isStringLiteral(node.moduleSpecifier) ||
      node.moduleSpecifier.text !== "@phosphor-icons/react"
    ) {
      return;
    }
    const bindings = node.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return;
    bindings.elements.forEach((element) => iconNames.add(element.name.text));
  });

  return iconNames;
};

const getElementParts = (
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
): {
  attributes: ts.JsxAttributes;
  tagName: string;
} => ({
  attributes: node.attributes,
  tagName: node.tagName.getText(),
});

const hasSemanticallyTrueAriaHidden = (
  attributes: ts.JsxAttributes,
  sourceFile: ts.SourceFile,
): boolean => {
  const matchingAttributes = attributes.properties.filter(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) &&
      property.name.getText(sourceFile) === "aria-hidden",
  );
  if (matchingAttributes.length !== 1) return false;

  const [attribute] = matchingAttributes;
  if (!attribute.initializer) return true;
  if (ts.isStringLiteral(attribute.initializer)) {
    return attribute.initializer.text.trim().toLowerCase() === "true";
  }
  if (!ts.isJsxExpression(attribute.initializer)) return false;
  const expression = attribute.initializer.expression;
  return Boolean(
    expression &&
    unwrapExpression(expression).kind === ts.SyntaxKind.TrueKeyword,
  );
};

const classTokens = (value: string): Set<string> =>
  new Set(value.split(/\s+/u).filter(Boolean));

const auditSource = (path: string, source: string): SourceAudit => {
  const sourceFile = parseSource(path, source);
  const phosphorIconNames = getPhosphorIconNames(sourceFile);
  const iconViolations = new Set<string>();
  const motionViolations = new Set<string>();
  const semanticViolations = new Set<string>();

  const location = (node: ts.Node): string => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    return `${path}:${line + 1}`;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node)) {
      const renderedText = getJsxTextVariants(node.children, sourceFile).map(
        normalizeText,
      );
      for (const text of renderedText) {
        if (FORBIDDEN_KICKER_TEXT.has(text)) {
          semanticViolations.add(
            `${location(node)} adds forbidden JSX text "${text}"`,
          );
        }
      }
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const { attributes, tagName } = getElementParts(node);

      if (tagName.toLowerCase() === "article") {
        semanticViolations.add(
          `${location(node)} adds forbidden article semantics`,
        );
      }

      const ariaLabels = getAttributeValues(
        attributes,
        "aria-label",
        sourceFile,
      );
      for (const value of ariaLabels) {
        if (
          typeof value === "string" &&
          FORBIDDEN_LANDMARK_LABELS.has(normalizeText(value))
        ) {
          semanticViolations.add(
            `${location(node)} adds forbidden landmark label "${normalizeText(value)}"`,
          );
        }
      }

      for (const attributeName of COPY_ATTRIBUTE_NAMES) {
        for (const value of getAttributeValues(
          attributes,
          attributeName,
          sourceFile,
        )) {
          if (typeof value !== "string") continue;
          const text = normalizeText(value);
          if (FORBIDDEN_KICKER_TEXT.has(text)) {
            semanticViolations.add(
              `${location(node)} adds forbidden ${attributeName} copy "${text}"`,
            );
          }
        }
      }

      if (path.endsWith("DataRoomAccessClient.tsx")) {
        const roles = getAttributeValues(attributes, "role", sourceFile);
        if (
          roles.some(
            (value) =>
              typeof value === "string" &&
              normalizeText(value).toLowerCase() === "alert",
          )
        ) {
          semanticViolations.add(
            `${location(node)} adds forbidden alert semantics`,
          );
        }
      }

      if (phosphorIconNames.has(tagName)) {
        if (!hasSemanticallyTrueAriaHidden(attributes, sourceFile)) {
          iconViolations.add(
            `${location(node)} <${tagName}> must set aria-hidden to true`,
          );
        }
      }

      for (const classVariant of getAttributeClassVariants(
        attributes,
        sourceFile,
      )) {
        const tokens = classTokens(classVariant);
        const hasUnboundedAnimation =
          tokens.has("animate-spin") || tokens.has("animate-pulse");
        if (
          hasUnboundedAnimation &&
          !tokens.has("motion-reduce:animate-none")
        ) {
          motionViolations.add(
            `${location(node)} loading animation lacks a reduced-motion stop`,
          );
        }
        if (
          tokens.has("transition-transform") &&
          !tokens.has("motion-reduce:transition-none")
        ) {
          motionViolations.add(
            `${location(node)} transform transition lacks a reduced-motion stop`,
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return {
    iconViolations: Array.from(iconViolations),
    motionViolations: Array.from(motionViolations),
    semanticViolations: Array.from(semanticViolations),
  };
};

const assertNoViolations = (violations: string[], message: string): void => {
  assert.deepEqual(violations, [], `${message}\n${violations.join("\n")}`);
};

/* ------------------------------------------------------------------------ *
 * Positive parity surface
 *
 * The audits above are blacklists: they only prove that nothing forbidden was
 * ADDED. On their own they pass against an empty component, so they cannot
 * detect a state branch that the redesign dropped. The inventory below is the
 * whitelist half — every entry was read out of the pre-redesign baseline
 * (`git show d8ba193^:<path>`) and must remain in the current route source,
 * including each loading / empty / error / read-only / permission-denied
 * branch, its accessible name, and its guide/testid hooks.
 *
 * This is deliberately a supplemental source-level deletion guard, not proof
 * that every branch is reachable at runtime. CORE-004/CORE-005 cover the
 * critical list, filtered-empty, share-manager, analytics-success, public-room,
 * and restricted audit-log paths in a real browser; loading/error branches
 * remain here until the project has a component-render harness.
 * ------------------------------------------------------------------------ */

type BranchPolarity = "true" | "false";

interface BranchRecord {
  artifacts: Set<string>;
  guard: string;
  when: BranchPolarity;
}

interface SurfaceInventory {
  artifacts: Set<string>;
  branches: BranchRecord[];
}

/**
 * A single renderable fact a branch must still produce. A bare string is an
 * exact artifact match; `{ anyOf }` is satisfied by any one of the listed
 * artifacts.
 *
 * `anyOf` exists for facts that are contractually "a loading indicator" but
 * whose presentation is legitimately interchangeable. Pinning a loading branch
 * to the literal token `.animate-spin` would fail a teammate who swaps a
 * hand-rolled pulse skeleton for `<Skeleton>` — a presentation change that
 * keeps the state branch intact. Requiring *some* loading affordance still
 * fails closed: a branch that renders nothing satisfies none of them.
 */
type SurfaceRequirement = string | { anyOf: readonly string[] };

/** Any affordance that communicates "this region is still loading". */
const LOADING_INDICATOR: SurfaceRequirement = {
  anyOf: [
    ".animate-spin",
    ".animate-pulse",
    "<CircleNotch>",
    "<Progress>",
    "<Skeleton>",
    "<Spinner>",
    "<SpinnerGap>",
  ],
};

interface BranchRequirement {
  guard: string;
  renders: readonly SurfaceRequirement[];
  when: BranchPolarity;
}

interface SurfaceContract {
  branches: BranchRequirement[];
  requires: string[];
}

const satisfiesRequirement = (
  artifacts: Set<string>,
  requirement: SurfaceRequirement,
): boolean =>
  typeof requirement === "string"
    ? artifacts.has(requirement)
    : requirement.anyOf.some((candidate) => artifacts.has(candidate));

const describeRequirement = (requirement: SurfaceRequirement): string =>
  typeof requirement === "string"
    ? requirement
    : `one of [${requirement.anyOf.join(" | ")}]`;

/**
 * Every renderable fact a source file exposes, as flat strings:
 *   `Some copy`      static JSX child text or copy-bearing attribute value
 *   `<Tag>`          a rendered element/component
 *   `Tag.prop`       a prop passed to it
 *   `Tag.prop=value` a prop passed to it with a statically known value
 *   `.token`         a className token
 *   `aria:value`     an accessible name
 *   `guide:value`    a data-guide hook
 *   `testid:value`   a data-testid hook
 */
const collectArtifacts = (
  root: ts.Node,
  sourceFile: ts.SourceFile,
): Set<string> => {
  const artifacts = new Set<string>();

  const addText = (value: string): void => {
    const text = normalizeText(value);
    if (text) artifacts.add(text);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node)) {
      for (const child of node.children) {
        if (ts.isJsxText(child)) {
          addText(child.text);
        } else if (ts.isJsxExpression(child)) {
          for (const value of getStaticValues(child.expression, sourceFile)) {
            if (typeof value === "string") addText(value);
          }
        }
      }
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const { attributes, tagName } = getElementParts(node);
      artifacts.add(`<${tagName}>`);

      for (const property of attributes.properties) {
        if (!ts.isJsxAttribute(property)) continue;
        const attributeName = property.name.getText(sourceFile);
        artifacts.add(`${tagName}.${attributeName}`);

        const values = property.initializer
          ? getStaticValues(property.initializer, sourceFile)
          : [true];
        for (const value of values) {
          const text =
            typeof value === "string" ? normalizeText(value) : String(value);
          if (!text) continue;
          artifacts.add(`${tagName}.${attributeName}=${text}`);
          if (attributeName === "aria-label") artifacts.add(`aria:${text}`);
          if (attributeName === "data-guide") artifacts.add(`guide:${text}`);
          if (attributeName === "data-testid") artifacts.add(`testid:${text}`);
          if (COPY_ATTRIBUTE_NAMES.has(attributeName)) addText(text);
        }
      }

      for (const variant of getAttributeClassVariants(attributes, sourceFile)) {
        for (const token of classTokens(variant)) artifacts.add(`.${token}`);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(root);
  return artifacts;
};

const containsJsx = (node: ts.Node): boolean => {
  let found = false;
  const visit = (candidate: ts.Node): void => {
    if (found) return;
    if (
      ts.isJsxElement(candidate) ||
      ts.isJsxSelfClosingElement(candidate) ||
      ts.isJsxFragment(candidate)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return found;
};

const collectBranches = (sourceFile: ts.SourceFile): BranchRecord[] => {
  const branches: BranchRecord[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isConditionalExpression(node) &&
      (containsJsx(node.whenTrue) || containsJsx(node.whenFalse))
    ) {
      const guard = normalizeText(node.condition.getText(sourceFile));
      branches.push({
        artifacts: collectArtifacts(node.whenTrue, sourceFile),
        guard,
        when: "true",
      });
      branches.push({
        artifacts: collectArtifacts(node.whenFalse, sourceFile),
        guard,
        when: "false",
      });
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      containsJsx(node.right)
    ) {
      branches.push({
        artifacts: collectArtifacts(node.right, sourceFile),
        guard: normalizeText(node.left.getText(sourceFile)),
        when: "true",
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return branches;
};

const inventorySource = (path: string, source: string): SurfaceInventory => {
  const sourceFile = parseSource(path, source);
  return {
    artifacts: collectArtifacts(sourceFile, sourceFile),
    branches: collectBranches(sourceFile),
  };
};

const findMissingSurface = (
  inventory: SurfaceInventory,
  contract: SurfaceContract,
): string[] => {
  const missing: string[] = [];

  for (const required of contract.requires) {
    if (!inventory.artifacts.has(required)) {
      missing.push(`missing surface ${JSON.stringify(required)}`);
    }
  }

  for (const requirement of contract.branches) {
    const candidates = inventory.branches.filter(
      (branch) =>
        branch.guard === requirement.guard && branch.when === requirement.when,
    );
    if (candidates.length === 0) {
      missing.push(
        `missing ${requirement.when} branch of guard ${JSON.stringify(requirement.guard)}`,
      );
      continue;
    }
    const satisfied = candidates.some((branch) =>
      requirement.renders.every((artifact) =>
        satisfiesRequirement(branch.artifacts, artifact),
      ),
    );
    if (!satisfied) {
      missing.push(
        `guard ${JSON.stringify(requirement.guard)} (${requirement.when}) no longer renders ${JSON.stringify(requirement.renders.map(describeRequirement))}`,
      );
    }
  }

  return missing;
};

const SURFACE_CONTRACT: Record<(typeof TASK_7_FILES)[number], SurfaceContract> =
  {
    "src/components/pages/DataRoomsClient.tsx": {
      branches: [
        // loading: skeleton rows, not an empty render
        { guard: "isLoading", renders: [LOADING_INDICATOR], when: "true" },
        // empty
        {
          guard: "dataRooms.length === 0",
          renders: [
            "<EmptyState>",
            "No data rooms yet",
            "Create a data room to organize documents and share a branded experience.",
          ],
          when: "true",
        },
        // empty after filtering
        {
          guard: "filteredRooms.length === 0",
          renders: ["<EmptyState>", "Try adjusting your search term."],
          when: "true",
        },
        // read-only: creation affordances are permission gated
        {
          guard: "canCreateDataRooms",
          renders: ["New Data Room"],
          when: "true",
        },
        {
          guard: "canCreateDataRooms",
          renders: ["Create Data Room"],
          when: "true",
        },
        // permission denied: row actions collapse for non-managers
        {
          guard: "canManageRoom",
          renders: ["Edit details", "Delete"],
          when: "true",
        },
        // navigation overlay
        {
          guard: "redirectingToRoom",
          renders: [
            "Opening data room…",
            "aria:Opening data room",
            LOADING_INDICATOR,
          ],
          when: "true",
        },
        { guard: "isDeleting", renders: [LOADING_INDICATOR], when: "true" },
      ],
      requires: [
        "guide:data-rooms-table",
        "guide:data-rooms-new-button",
        "guide:data-rooms-actions",
        "aria:Open actions",
        "aria:Opening data room",
        "aria:Search data rooms",
        "Data Rooms",
        "Create client-ready spaces with dedicated access controls and analytics.",
        "New Data Room",
        "Search data rooms…",
        "No data rooms yet",
        "Create a data room to organize documents and share a branded experience.",
        "Create Data Room",
        "Try adjusting your search term.",
        "Opening data room…",
        "Delete data room?",
        "This action cannot be undone.",
        "This will permanently delete",
        "and all nested folders and documents.",
        "Edit data room",
        "Save changes",
        "No description",
        "Total Views",
        "Time Spent",
        "Showing",
        "Previous",
        "Next",
      ],
    },
    "src/components/pages/DataRoomPageClient.tsx": {
      branches: [
        // error + retry
        {
          guard: "metricsError",
          renders: [
            "Unable to load analytics",
            "Something went wrong while loading engagement metrics.",
            "Retry",
          ],
          when: "true",
        },
        // empty
        {
          guard: "!hasDocAnalytics && hasLoadedMetricsOnce",
          renders: [
            "Document analytics will appear once this data room is shared.",
          ],
          when: "true",
        },
        // loading
        {
          guard: "isLoadingMetrics",
          renders: [LOADING_INDICATOR],
          when: "true",
        },
        // read-only: upload only when the viewer can edit the room
        {
          guard: "canEditDataRoom",
          renders: ["Upload Document", "guide:data-room-upload-button"],
          when: "true",
        },
        // permission denied: owner-only menu entries
        {
          guard: "isOwner",
          renders: ["More", "Access", "Internal audit log"],
          when: "true",
        },
        {
          guard: "currentFolderId",
          renders: ["Download this folder (.zip)"],
          when: "true",
        },
      ],
      requires: [
        "guide:data-room-upload-button",
        "guide:data-room-manage-links",
        "guide:data-room-documents-table",
        "aria:Data room header",
        "Back to data rooms",
        "Manage & share this room’s documents securely",
        "Documents",
        "Documents in this room",
        "Same powerful workspace experience, scoped to this data room",
        "Manage files just like in your main workspace—everything stays scoped to this room.",
        "Upload Document",
        "Download",
        "Download entire data room (.zip)",
        "Download this folder (.zip)",
        "Engagement Overview",
        "Detailed Analytics",
        "Unable to load analytics",
        "Something went wrong while loading engagement metrics.",
        "Retry",
        "Document analytics will appear once this data room is shared.",
        "Share",
        "Refresh",
        "More",
        "Access",
        "Internal audit log",
      ],
    },
    "src/components/pages/DataRoomDocumentsRouteClient.tsx": {
      branches: [],
      requires: [
        "<DataRoomPageClient>",
        "DataRoomPageClient.dataRoom",
        "DataRoomPageClient.slug",
      ],
    },
    "src/components/pages/DataRoomLinksManager.tsx": {
      branches: [],
      requires: [
        "<LinksManagerCard>",
        "LinksManagerCard.resourceType=data_room",
        "LinksManagerCard.resourceId",
        "LinksManagerCard.workspaceId",
        "LinksManagerCard.resourceName",
        "LinksManagerCard.defaultLinkName",
        "LinksManagerCard.dataGuideCard=data-room-links-card",
        "LinksManagerCard.dataGuideNewButton=data-room-links-new-button",
        "LinksManagerCard.dataGuideList=data-room-links-list",
      ],
    },
    "src/components/pages/DataRoomShareClient.tsx": {
      branches: [],
      requires: [
        "<PageContainer>",
        "<PageHeader>",
        "PageHeader.title=Share",
        "PageHeader.description",
        "<DataRoomLinksManager>",
        "DataRoomLinksManager.dataRoom",
        "Back to data room",
        "Share",
      ],
    },
    "src/components/pages/DataRoomShareRouteClient.tsx": {
      branches: [],
      requires: ["<DataRoomShareClient>", "DataRoomShareClient.dataRoom"],
    },
    "src/components/pages/DataRoomAnalyticsClient.tsx": {
      branches: [
        // loading
        {
          guard: "isLoadingMetrics",
          renders: [LOADING_INDICATOR],
          when: "true",
        },
        {
          guard: "isLoadingDocuments",
          renders: [LOADING_INDICATOR],
          when: "true",
        },
        { guard: "isNdaLoading", renders: [LOADING_INDICATOR], when: "true" },
        // empty: whole analytics surface
        {
          guard: "hasAnalytics",
          renders: [
            "<EmptyState>",
            "No analytics data",
            "Analytics will appear here once your data room receives traffic matching your filters.",
          ],
          when: "false",
        },
        // empty: room-level views
        {
          guard:
            "roomOverview.totalViews === 0 && roomOverview.uniqueViews === 0",
          renders: [
            "<EmptyState>",
            "No room-level views yet",
            "Room-level views will appear once this data room receives traffic matching your filters.",
          ],
          when: "true",
        },
        // empty: per-document table
        {
          guard: "documentMetrics.length === 0",
          renders: [
            "<EmptyState>",
            "No document activity yet",
            "Upload files to start tracking engagement.",
          ],
          when: "true",
        },
        // permission/feature denied: viewer identity tracking off
        {
          guard: "!viewerInsightsEnabled",
          renders: [
            "<EmptyState>",
            "Viewer tracking disabled",
            'Turn on "Collect emails for analytics" on a link to see who is viewing your documents. Email verification activates automatically.',
          ],
          when: "true",
        },
        // empty: viewer table
        {
          guard: "viewerStats.length === 0",
          renders: [
            "<EmptyState>",
            "No viewer data yet",
            "Viewer-level data will appear once verified viewers engage with this selection.",
          ],
          when: "true",
        },
        // empty: NDA signatures
        {
          guard: "ndaSignatures.length",
          renders: ["No signatures captured yet."],
          when: "false",
        },
        // empty: page breakdown
        {
          guard: "doc.pageBreakdown.length",
          renders: [
            "Page-level analytics will appear once viewers engage with this document.",
          ],
          when: "false",
        },
        {
          guard: "chartData.length",
          renders: ["No per-page activity captured yet for this document."],
          when: "false",
        },
        {
          guard: "docsToShow.length",
          renders: ["No per-document activity captured yet."],
          when: "false",
        },
      ],
      requires: [
        "guide:data-room-analytics-overview",
        "guide:data-room-analytics-documents",
        "guide:data-room-analytics-viewers",
        "aria:Analytics filters",
        "aria:Analytics metrics",
        "PageHeader.title=Engagement overview",
        "aria:Document analytics",
        "aria:Viewer insights",
        "aria:NDA signatures",
        "aria:View NDA signatures",
        "Back to data room",
        "Refresh",
        "Engagement Overview",
        "Overall room traffic for the selected filters.",
        "No analytics data",
        "Analytics will appear here once your data room receives traffic matching your filters.",
        "No room-level views yet",
        "Room-level views will appear once this data room receives traffic matching your filters.",
        "Document activity",
        "Per-document engagement across this data room.",
        "No document activity yet",
        "Upload files to start tracking engagement.",
        "Viewer insights",
        "Available for links that collect verified viewer emails.",
        "Viewer tracking disabled",
        'Turn on "Collect emails for analytics" on a link to see who is viewing your documents. Email verification activates automatically.',
        "No viewer data yet",
        "Viewer-level data will appear once verified viewers engage with this selection.",
        "NDA signatures",
        "Signed NDAs",
        "Viewer signatures collected for NDA-enabled links.",
        "Checking for signatures...",
        "Awaiting the first signature.",
        "No signatures captured yet.",
        "No per-document activity captured yet.",
        "No per-page activity captured yet for this document.",
        "Page-level analytics will appear once viewers engage with this document.",
        "Time spent per page",
        "Visual breakdown of engagement by page.",
        "Total room views",
        "Unique room viewers",
        "Total document views",
        "Unique document viewers",
        "Time spent on documents",
        "Data Room Summary",
        "Documents Summary",
        "Detailed engagement across all shared documents.",
        "Document-focused analytics for the selected filters.",
        "Download PDF",
        "Preparing...",
        "View signatures",
        "No views yet",
      ],
    },
    "src/components/pages/DataRoomAnalyticsRouteClient.tsx": {
      branches: [],
      requires: [
        "<DataRoomAnalyticsClient>",
        "DataRoomAnalyticsClient.dataRoom",
      ],
    },
    "src/components/pages/DataRoomAccessClient.tsx": {
      branches: [
        // loading
        { guard: "isLoading", renders: [LOADING_INDICATOR], when: "true" },
        {
          guard: "isLoadingRolePresets || isLoadingDataRooms",
          renders: ["Loading access options…"],
          when: "true",
        },
        { guard: "isInviting", renders: [LOADING_INDICATOR], when: "true" },
        // error
        {
          guard: "loadError",
          renders: ["Unable to load access"],
          when: "true",
        },
        {
          guard: "!isInviteEmailValid && inviteEmailTrimmed",
          renders: ["Enter a valid email."],
          when: "true",
        },
        // empty
        {
          guard: "members.length === 0",
          renders: ["No members found"],
          when: "true",
        },
        // read-only: owners show a static badge instead of the access control
        { guard: "isOwner", renders: ["Owner Access"], when: "true" },
        {
          guard: "isOwner",
          renders: ["Explicit access:", "None", "Viewer", "Editor"],
          when: "false",
        },
        { guard: "isInvite", renders: ["Invite pending"], when: "true" },
        {
          guard: "mutatingUserId === member.userId",
          renders: ["Saving..."],
          when: "true",
        },
      ],
      requires: [
        "Back to data room",
        "Room Members",
        "Refresh",
        "Invite Member",
        "Invite by Email",
        "Invite someone to the workspace and grant access to this data room. Presets are apply-only and won’t stay linked after you send the invite.",
        "Email",
        "viewer@company.com",
        "Enter a valid email.",
        "Send invite",
        "Cancel",
        "Loading access options…",
        "Unable to load access",
        "No members found",
        "Unknown user",
        "Owner",
        "Member",
        "Pending Invite",
        "Owner Access",
        "Invite pending",
        "Explicit access:",
        "Access",
        "None",
        "Viewer",
        "Editor",
        "Saving...",
        "Docs:",
        "Owners always have access. Non-owners can access this room via workspace “All data rooms” access or an explicit room override.",
      ],
    },
    "src/components/pages/DataRoomAuditLogClient.tsx": {
      branches: [
        {
          guard: "isOwner",
          renders: ["<InternalAuditLogSection>"],
          when: "true",
        },
        // permission denied
        {
          guard: "isOwner",
          renders: [
            "<EmptyState>",
            "Access restricted",
            "Only workspace owners can view internal audit logs.",
          ],
          when: "false",
        },
      ],
      requires: [
        "<PageContainer>",
        "<PageHeader>",
        "PageHeader.title=Internal audit log",
        "<InternalAuditLogSection>",
        "InternalAuditLogSection.workspaceId",
        "InternalAuditLogSection.dataRoomId",
        "<EmptyState>",
        "EmptyState.title=Access restricted",
        "EmptyState.description=Only workspace owners can view internal audit logs.",
        "Back to data room",
        "Internal audit log",
        "Access restricted",
        "Only workspace owners can view internal audit logs.",
      ],
    },
  };

const STUB_SOURCE = `
  import React from "react";
  const Component: React.FC = () => null;
  export default Component;
`;

test("data room redesign preserves existing copy and neutral wrappers", async () => {
  for (const path of TASK_7_FILES) {
    const audit = auditSource(path, await readSource(path));
    assertNoViolations(
      audit.semanticViolations,
      `${path} changed strict copy or semantics`,
    );
  }

  const badAudit = auditSource(
    "fixtures/DataRoomAccessClient.tsx",
    `
      const fixture = (
        <>
          <p className={"dk-nocturne-" + "kicker"}>
            {"Workspace " + "access"}
          </p>
          <section aria-label={"Data room " + "share links"} />
          <div role={\`alert\`} />
          <article />
        </>
      );
    `,
  );
  assert.equal(badAudit.semanticViolations.length, 4);

  const neutralAudit = auditSource(
    "fixtures/Neutral.tsx",
    `
      const fixture = (
        <div className={"dk-nocturne-" + "kicker"}>Existing content</div>
      );
    `,
  );
  assert.deepEqual(neutralAudit.semanticViolations, []);

  // Forbidden copy smuggled in through props, not children, must still trip.
  const attributeAudit = auditSource(
    "fixtures/AttributeCopy.tsx",
    `
      const fixture = (
        <>
          <StatCard title="Room signals" />
          <SectionHeading heading={"Room " + "files"} />
          <Panel label={\`Structured activity\`} />
          <Callout description={flag ? "Known recipients" : "Selected range"} />
          <Field placeholder="Files" />
          <Chip text="Room" />
          <Meta summary="Recipient agreements" />
          <Legend subtitle="File-level signals" />
          <Nav aria-label="Room links" />
          <Note message="Workspace access" />
        </>
      );
    `,
  );
  assert.equal(attributeAudit.semanticViolations.length, 11);

  const neutralAttributeAudit = auditSource(
    "fixtures/NeutralAttributeCopy.tsx",
    `
      const fixture = (
        <>
          <StatCard title="Total room views" />
          <StatCard id="Room signals" data-slot="Room files" />
        </>
      );
    `,
  );
  assert.deepEqual(neutralAttributeAudit.semanticViolations, []);
});

test("every Task 7 data room route retains its baseline state surface source", async () => {
  for (const path of TASK_7_FILES) {
    const missing = findMissingSurface(
      inventorySource(path, await readSource(path)),
      SURFACE_CONTRACT[path],
    );
    assert.deepEqual(
      missing,
      [],
      `${path} lost pre-redesign surface\n${missing.join("\n")}`,
    );
  }
});

test("the Task 7 surface contract rejects a component stubbed to render nothing", async () => {
  // Guards the audit itself: before this contract existed, replacing all ten
  // components with `() => null` left the suite green.
  for (const path of TASK_7_FILES) {
    const contract = SURFACE_CONTRACT[path];
    assert.ok(
      contract.requires.length > 0 || contract.branches.length > 0,
      `${path} has no positive parity requirements`,
    );

    const missing = findMissingSurface(
      inventorySource(path, STUB_SOURCE),
      contract,
    );
    assert.equal(
      missing.length,
      contract.requires.length + contract.branches.length,
      `${path} contract does not fail closed against a () => null stub`,
    );
  }

  // Dropping a single branch must also fail, not just wholesale deletion.
  const auditLogPath = "src/components/pages/DataRoomAuditLogClient.tsx";
  const auditLogSource = await readSource(auditLogPath);
  const withoutDeniedBranch = auditLogSource.replace(
    /description="Only workspace owners can view internal audit logs\."/,
    'description="Only owners can see this."',
  );
  assert.notEqual(withoutDeniedBranch, auditLogSource);
  const regression = findMissingSurface(
    inventorySource(auditLogPath, withoutDeniedBranch),
    SURFACE_CONTRACT[auditLogPath],
  );
  assert.ok(
    regression.length > 0,
    "contract must catch a reworded permission-denied branch",
  );
});

test("every direct Task 7 Phosphor JSX icon is semantically hidden", async () => {
  for (const path of TASK_7_FILES) {
    const audit = auditSource(path, await readSource(path));
    assertNoViolations(
      audit.iconViolations,
      `${path} exposes decorative icons to assistive technology`,
    );
  }

  const audit = auditSource(
    "fixtures/IconValues.tsx",
    `
      import { Eye } from "@phosphor-icons/react";
      const fixture = (
        <>
          <Eye aria-hidden />
          <Eye aria-hidden={true} />
          <Eye aria-hidden="true" />
          <Eye aria-hidden={false} />
          <Eye aria-hidden="false" />
          <Eye />
          <Eye aria-hidden={hidden} />
        </>
      );
    `,
  );
  assert.equal(audit.iconViolations.length, 4);
});

test("Task 7 loading animations and transform transitions respect reduced motion", async () => {
  for (const path of TASK_7_FILES) {
    const audit = auditSource(path, await readSource(path));
    assertNoViolations(audit.motionViolations, `${path} has unbounded motion`);
  }

  const badAudit = auditSource(
    "fixtures/BadMotion.tsx",
    `
      const fixture = (
        <>
          <div className={loading ? "animate-" + "spin" : "motion-reduce:animate-none"} />
          <div className={"animate-" + "pulse"} />
          <div className={"transition-" + "transform"} />
        </>
      );
    `,
  );
  assert.equal(badAudit.motionViolations.length, 3);

  const goodAudit = auditSource(
    "fixtures/GoodMotion.tsx",
    `
      const fixture = (
        <>
          <div className={cn("base", loading && ("animate-" + "spin motion-reduce:animate-none"))} />
          <div className={"transition-" + "transform motion-reduce:transition-none"} />
        </>
      );
    `,
  );
  assert.deepEqual(goodAudit.motionViolations, []);
});
