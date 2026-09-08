import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const readSource = async (relativePath: string): Promise<string> =>
  readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");

const listTsxFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return listTsxFiles(path);
      return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
    }),
  );

  return nestedFiles.flat();
};

const expectClassTokens = (
  source: string,
  tokens: readonly string[],
  label: string,
): void => {
  for (const token of tokens) {
    assert.match(
      source,
      new RegExp(`(?:^|\\s)${token}(?=\\s|"|$)`),
      `${label} must include ${token}`,
    );
  }
};

test("shared form controls keep inset, themed, destructive focus outlines", async () => {
  const controls = await Promise.all(
    [
      "src/components/ui/input.tsx",
      "src/components/ui/textarea.tsx",
      "src/components/ui/select.tsx",
    ].map(async (path) => ({ path, source: await readSource(path) })),
  );

  for (const { path, source } of controls) {
    expectClassTokens(
      source,
      [
        "focus-visible:outline-2",
        "focus-visible:outline-offset-\\[-2px\\]",
        "focus-visible:outline-ring",
        "focus-visible:outline-solid",
        "aria-invalid:border-destructive",
        "aria-invalid:ring-destructive/30",
        "aria-invalid:focus-visible:outline-destructive",
      ],
      path,
    );
    assert.doesNotMatch(source, /focus-visible:outline-offset-2/);
  }

  const button = await readSource("src/components/ui/button.tsx");
  assert.match(button, /focus-visible:outline-offset-2/);
  assert.doesNotMatch(button, /focus-visible:outline-offset-\[-2px\]/);
});

test("CardContent supplies the standard top inset", async () => {
  const card = await readSource("src/components/ui/card.tsx");

  assert.match(
    card,
    /data-slot="card-content"[\s\S]*className=\{cn\("px-4 pt-4 \[&:last-child\]:pb-4"/,
  );
});

test("only the four approved edge-to-edge card consumers opt out of the top inset", async () => {
  const exceptions = [
    {
      path: "src/components/settings/AppearanceSettings.tsx",
      identifyingToken: "pl-9",
    },
    {
      path: "src/components/public/PublicGateShell.tsx",
      identifyingToken: "pb-7",
    },
    {
      path: "src/components/pages/PublicDataRoomViewerClient.tsx",
      identifyingToken: "pb-5",
    },
    {
      path: "src/components/marketing/pricing/MarketingPlanCard.tsx",
      identifyingToken: "gap-8",
    },
  ] as const;

  for (const exception of exceptions) {
    const source = await readSource(exception.path);
    const matchingClasses = [
      ...source.matchAll(/<CardContent className="([^"]*)">/g),
    ]
      .map((match) => match[1])
      .filter((className) =>
        className.split(/\s+/).includes(exception.identifyingToken),
      );

    assert.equal(matchingClasses.length, 1, exception.path);
    expectClassTokens(matchingClasses[0], ["pt-0"], exception.path);
  }

  const ptZeroOccurrences: string[] = [];
  for (const absolutePath of await listTsxFiles(join(PROJECT_ROOT, "src"))) {
    const source = await readFile(absolutePath, "utf8");
    for (const match of source.matchAll(
      /<CardContent\b[^>]*\bclassName="([^"]*)"/g,
    )) {
      if (!match[1].split(/\s+/).includes("pt-0")) continue;
      ptZeroOccurrences.push(
        relative(PROJECT_ROOT, absolutePath).split(sep).join("/"),
      );
    }
  }

  assert.deepEqual(
    [...new Set(ptZeroOccurrences)].sort(),
    exceptions.map(({ path }) => path).sort(),
    `unexpected CardContent pt-0 occurrences: ${ptZeroOccurrences.join(", ")}`,
  );
});

test("ordinary CardContent consumers rely on the shared top inset", async () => {
  const ordinaryConsumers = [
    "src/components/pages/DataRoomAccessClient.tsx",
    "src/components/pages/DataRoomAnalyticsClient.tsx",
    "src/components/branding/WatermarkTemplatesManager.tsx",
    "src/components/settings/ProfileSettings.tsx",
    "src/components/settings/NotificationSettings.tsx",
    "src/components/settings/PrivacySettings.tsx",
  ];

  for (const path of ordinaryConsumers) {
    const source = await readSource(path);
    assert.doesNotMatch(
      source,
      /<CardContent className="[^"]*\bpt-4\b[^"]*"/,
      path,
    );
  }

  const formerlyRedundantOverrides = [
    {
      path: "src/components/pages/ContactClient.tsx",
      expectedClassName: "p-6 sm:p-8",
    },
    {
      path: "src/modules/reviews/ReviewDialog.tsx",
      expectedClassName: "relative z-10 p-4",
    },
    {
      path: "src/components/links/LinksManagerCard.tsx",
      expectedClassName: "px-0 pb-0",
    },
  ] as const;

  for (const consumer of formerlyRedundantOverrides) {
    const source = await readSource(consumer.path);
    assert.match(
      source,
      new RegExp(
        `<CardContent className="${consumer.expectedClassName.replaceAll(
          " ",
          "\\s+",
        )}">`,
      ),
      consumer.path,
    );
  }
});

test("dashboard cards do not conditionally compensate for the shared top inset", async () => {
  const dashboardCards = [
    "src/components/dashboard/RecentDataRooms.tsx",
    "src/components/dashboard/RecentDocuments.tsx",
    "src/components/dashboard/MostActiveContent.tsx",
    "src/components/dashboard/ViewsByCountry.tsx",
  ];

  for (const path of dashboardCards) {
    const source = await readSource(path);
    assert.doesNotMatch(source, /\bpt-4\b/, path);
    assert.match(
      source,
      /className=\{[\s\S]*?\.length === 0[\s\S]*?: undefined[\s\S]*?\}/,
      path,
    );
  }
});

test("redaction cards inherit the shared inset without local padding patches", async () => {
  const studio = await readSource(
    "src/components/documents/redaction/DocumentRedactionStudio.tsx",
  );
  const card = await readSource("src/components/ui/card.tsx");

  assert.match(card, /className=\{cn\("px-4 pt-4 \[&:last-child\]:pb-4"/);
  assert.match(studio, />\s*How It Works\s*</);
  assert.match(studio, />\s*Redactions\s*</);
  assert.match(studio, />\s*Apply Redaction\s*</);
  assert.doesNotMatch(
    studio,
    /<CardContent className="[^"]*\bpt-(?:0|4)\b[^"]*"/,
  );
});

test("NDA template structure guidance is always visible in the editor header", async () => {
  const source = await readSource("src/components/nda/NdaTemplatesPage.tsx");
  const description = source.match(
    /<DialogDescription[\s\S]*?<\/DialogDescription>/,
  )?.[0];

  assert.ok(description, "missing editor description");
  const visibleCopy = description
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  assert.ok(
    visibleCopy.includes(
      "Customize the NDA clauses. The header (parties, dates) and signature block are added automatically.",
    ),
  );
  assert.ok(
    visibleCopy.includes(
      "The template editor controls only the body clauses between the metadata (workspace, parties, dates) and the signature block. Those sections are added automatically to keep NDA branding and auditing consistent.",
    ),
  );
  assert.doesNotMatch(source, /HoverCard|About NDA template structure/);
});

test("NDA editor actions stack safely on mobile and retain the desktop row", async () => {
  const source = await readSource("src/components/nda/NdaTemplatesPage.tsx");
  const editorFooter = source.match(
    /<DialogFooter className="([^"]*grid-cols-2[^"]*)">([\s\S]*?)<\/DialogFooter>/,
  );

  assert.ok(editorFooter, "missing responsive editor footer");
  expectClassTokens(
    editorFooter[1],
    ["grid", "grid-cols-2", "gap-2", "px-4", "sm:flex", "sm:px-6"],
    "NDA editor footer",
  );

  const footerBody = editorFooter[2];
  const buttons = [...footerBody.matchAll(/<Button\b([\s\S]*?)<\/Button>/g)];
  const classNameFor = (label: string): string => {
    const button = buttons.find((match) => match[0].includes(label));
    assert.ok(button, `missing ${label} button`);
    const className = button[0].match(/className="([^"]*)"/)?.[1];
    assert.ok(className, `missing ${label} button classes`);
    return className;
  };

  for (const label of ["Preview", "Cancel"]) {
    expectClassTokens(
      classNameFor(label),
      ["min-h-11", "min-w-0", "w-full", "sm:w-auto"],
      `${label} button`,
    );
  }
  expectClassTokens(
    classNameFor("Create Template"),
    ["col-span-2", "min-h-11", "w-full", "sm:w-auto"],
    "primary save button",
  );
});
