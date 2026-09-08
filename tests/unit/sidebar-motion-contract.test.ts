import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  resolveSidebarMotionState,
  resolveSidebarTransition,
} from "@/components/ui/sidebarMotion";
import { layoutTween } from "@/lib/motion";

const readSidebarSource = (): string =>
  readFileSync(
    path.join(process.cwd(), "src/components/ui/sidebar.tsx"),
    "utf8",
  );

const readAuthenticatedLayoutSource = (): string =>
  readFileSync(
    path.join(process.cwd(), "src/components/layouts/AuthenticatedLayout.tsx"),
    "utf8",
  );

const readPdfViewerSource = (): string =>
  readFileSync(
    path.join(
      process.cwd(),
      "src/components/documents/pdf/engine/MozillaPdfViewer.tsx",
    ),
    "utf8",
  );

const readImageViewerSource = (): string =>
  readFileSync(
    path.join(
      process.cwd(),
      "src/components/documents/renderers/ImageViewer.tsx",
    ),
    "utf8",
  );

test("sidebar motion state keeps width, label opacity, and caret direction synchronized", () => {
  assert.deepEqual(resolveSidebarMotionState(false), {
    width: 232,
    labelOpacity: 1,
    labelMaxWidth: 176,
    caretRotation: 0,
  });
  assert.deepEqual(resolveSidebarMotionState(true), {
    width: 68,
    labelOpacity: 0,
    labelMaxWidth: 0,
    caretRotation: 180,
  });
});

test("sidebar transition waits for a user toggle and honors reduced motion", () => {
  assert.deepEqual(
    resolveSidebarTransition({
      hasToggledRail: false,
      prefersReducedMotion: false,
    }),
    { duration: 0 },
  );
  assert.deepEqual(
    resolveSidebarTransition({
      hasToggledRail: true,
      prefersReducedMotion: true,
    }),
    { duration: 0 },
  );
  assert.strictEqual(
    resolveSidebarTransition({
      hasToggledRail: true,
      prefersReducedMotion: false,
    }),
    layoutTween,
  );
  assert.equal(layoutTween.duration, 0.2);
});

test("the desktop sidebar consumes the shared motion state and transition", () => {
  const source = readSidebarSource();

  assert.match(source, /<motion\.aside/);
  assert.match(source, /resolveSidebarMotionState\(isSidebarCollapsed\)/);
  assert.match(source, /animate=\{\{ width: sidebarMotionState\.width \}\}/);
  assert.match(source, /transition=\{sidebarTransition\}/);
  assert.match(source, /resolveSidebarTransition\(/);
});

test("persisted startup and reduced-motion preferences bypass sidebar animation", () => {
  const source = readSidebarSource();

  assert.match(source, /useReducedMotion\(\)/);
  assert.match(source, /<motion\.aside[\s\S]*?initial=\{false\}/);
  assert.match(
    source,
    /resolveSidebarTransition\(\{[\s\S]*?hasToggledRail,[\s\S]*?prefersReducedMotion/,
  );
});

test("sidebar labels and the caret share the rail transition", () => {
  const source = readSidebarSource();
  const labelUses = source.match(/\{\.\.\.sidebarLabelMotion\}/g) ?? [];

  assert.match(
    source,
    /const sidebarLabelMotion[\s\S]*?opacity: sidebarMotionState\.labelOpacity[\s\S]*?transition: sidebarTransition/,
  );
  assert.ok(
    labelUses.length >= 5,
    `expected all label groups to share sidebarLabelMotion, found ${labelUses.length}`,
  );
  assert.match(
    source,
    /<motion\.span[\s\S]*?animate=\{\{ rotate: sidebarMotionState\.caretRotation \}\}[\s\S]*?transition=\{sidebarTransition\}[\s\S]*?<CaretLeft/,
  );
  assert.doesNotMatch(source, /<motion\.svg/);
});

test("sidebar text is not clipped before its shared opacity transition", () => {
  const source = readSidebarSource();

  assert.doesNotMatch(source, /isSidebarCollapsed[\s\S]{0,80}"[^"]*w-0/);
  assert.doesNotMatch(source, /isSidebarCollapsed[\s\S]{0,80}"[^"]*h-0/);
});

test("the desktop rail keeps its external toggle and focus indicators unclipped", () => {
  const source = readSidebarSource();
  const asideOpeningTag = source.match(/<motion\.aside[\s\S]*?>/)?.[0];

  assert.ok(asideOpeningTag, "the desktop rail must be a motion wrapper");
  assert.doesNotMatch(asideOpeningTag, /overflow-(?:hidden|clip)/);
  assert.match(source, /className="absolute top-1\/2 -right-3/);
  assert.match(source, /aria-expanded=\{!isSidebarCollapsed\}/);
  assert.match(source, /"sticky top-0[^"]*lg:flex"/);
  assert.doesNotMatch(source, /<Sheet/);
});

test("authenticated layout scopes one rail transition coordinator around the shell", () => {
  const source = readAuthenticatedLayoutSource();
  const providerSource = readFileSync(
    path.join(
      process.cwd(),
      "src/components/layouts/SidebarLayoutTransitionContext.tsx",
    ),
    "utf8",
  );

  assert.match(source, /<SidebarLayoutTransitionProvider>/);
  assert.match(
    source,
    /<SidebarLayoutTransitionProvider>[\s\S]*?<SidebarNav[\s\S]*?\{children\}[\s\S]*?<\/SidebarLayoutTransitionProvider>/,
  );
  assert.match(providerSource, /useLayoutEffect\(/);
  assert.match(providerSource, /coordinator\.activate\(\)/);
  assert.match(providerSource, /coordinator\.dispose\(\)/);
});

test("the rail begins coordination before toggling and settles only from its matching animated width", () => {
  const source = readSidebarSource();

  assert.match(source, /useSidebarLayoutTransitionCoordinator\(\)/);
  assert.match(
    source,
    /transitionSessionRef\.current = sidebarLayoutTransition\.begin\([\s\S]*?toggleSidebarCollapsed\(\)/,
  );
  assert.match(source, /onAnimationComplete=\{handleRailAnimationComplete\}/);
  assert.match(
    source,
    /sidebarLayoutTransition\.complete\([\s\S]*?completedWidth/,
  );
  assert.match(source, /sidebarLayoutTransition\.cancel\(/);
});

test("rail children keep invariant horizontal tracks while only their inner labels clip", () => {
  const source = readSidebarSource();

  assert.match(source, /grid-cols-\[48px_minmax\(0,1fr\)_auto\]/);
  assert.match(source, /data-dk-primary-nav-icon/);
  assert.match(source, /className="col-start-2[^"\n]*text-left/);
  assert.match(source, /className="col-start-3[^"\n]*justify-self-end/);
  assert.doesNotMatch(
    source,
    /isSidebarCollapsed \? "justify-center gap-0 px-0"/,
  );
  assert.doesNotMatch(source, /isSidebarCollapsed \? "ml-0" : "ml-3"/);
  assert.doesNotMatch(source, /isSidebarCollapsed && "px-2\.5"/);
  assert.match(
    source,
    /className="sr-only"[\s\S]*?Free Trial[\s\S]*?trialBadge\.title[\s\S]*?trialBadge\.subtitle/,
  );
  assert.match(source, /maxHeight: isSidebarCollapsed \? 0 : 96/);
});

test("authenticated PDF and image measurements use the scoped rail-aware resize committer", () => {
  const pdfSource = readPdfViewerSource();
  const imageSource = readImageViewerSource();

  for (const source of [pdfSource, imageSource]) {
    assert.match(source, /useOptionalSidebarLayoutTransitionCoordinator\(\)/);
    assert.match(source, /createSidebarAwareResizeCommitter\(/);
    assert.match(source, /requestCommit\(\)/);
    assert.match(source, /dispose\(\)/);
  }

  assert.doesNotMatch(imageSource, /setContainerWidth/);
  assert.doesNotMatch(imageSource, /setContainerHeight/);
  assert.match(imageSource, /setContainerSize\(\(previous\) =>/);
  assert.match(
    imageSource,
    /previous\.width === width && previous\.height === height[\s\S]*?previous/,
  );
});
