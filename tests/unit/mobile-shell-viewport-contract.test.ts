import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  resolveMobileShellScrollRestoration,
  resolveMobileShellScrollTop,
} from "@/components/layouts/mobileScrollRestoration";

const readSource = async (path: string): Promise<string> =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("the compact authenticated shell avoids iOS fixed-chrome viewport drift", async () => {
  const [layout, header, tabs, css] = await Promise.all([
    readSource("src/components/layouts/AuthenticatedLayout.tsx"),
    readSource("src/components/ui/mobile-header.tsx"),
    readSource("src/components/ui/bottom-tab-bar.tsx"),
    readSource("src/app/globals.css"),
  ]);

  assert.match(layout, /dk-authenticated-shell/);
  assert.match(layout, /dk-authenticated-frame/);
  assert.match(layout, /dk-authenticated-main/);
  assert.match(layout, /scrollPositionsRef/);
  assert.match(layout, /historyNavigationPathnameRef/);
  assert.match(
    layout,
    /historyNavigationPathnameRef\.current = window\.location\.pathname/,
  );
  assert.match(layout, /resolveMobileShellScrollRestoration/);
  assert.match(layout, /historyNavigationPathnameRef\.current = null/);
  assert.match(layout, /onScroll=\{\(event\) =>/);
  assert.match(
    layout,
    /scrollPositionsRef\.current\.set\(\s*currentScrollKey,\s*event\.currentTarget\.scrollTop/,
  );
  assert.doesNotMatch(layout, /return \(\) => \{\s*scrollPositions\.set\(/);
  assert.match(layout, /popstate/);
  assert.match(header, /dk-mobile-header/);
  assert.match(tabs, /dk-mobile-bottom-nav/);

  assert.match(css, /@supports \(-webkit-touch-callout:\s*none\)/);
  assert.match(css, /\.dk-authenticated-shell[\s\S]*height:\s*100dvh/);
  assert.match(css, /\.dk-authenticated-main[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /html:has\(\.dk-authenticated-shell\)/);
  assert.match(css, /body:has\(\.dk-authenticated-shell\)/);
  assert.match(css, /\.dk-mobile-header[\s\S]*position:\s*relative/);
  assert.match(css, /\.dk-mobile-bottom-nav[\s\S]*position:\s*relative/);
});

test("mobile shell restores only the exact popped pathname", () => {
  assert.equal(
    resolveMobileShellScrollTop("/documents", "/documents", 420),
    420,
  );
  assert.equal(resolveMobileShellScrollTop("/documents", "/documents", 0), 0);
  assert.equal(
    resolveMobileShellScrollTop("/documents", "/documents", undefined),
    0,
  );

  // A query/hash-only popstate does not rerun the pathname effect. Its stale
  // marker must not restore an unrelated route during the next navigation.
  assert.equal(resolveMobileShellScrollTop("/documents", "/settings", 420), 0);
  assert.equal(resolveMobileShellScrollTop(null, "/settings", 420), 0);
});

test("mobile shell scrolls forward navigation to the top without a pending restoration", () => {
  assert.deepEqual(
    resolveMobileShellScrollRestoration(null, "/settings", 420, 0),
    {
      scrollTop: 0,
      pendingTop: null,
    },
  );
});

test("mobile shell restores history navigation immediately when the container is tall enough", () => {
  assert.deepEqual(
    resolveMobileShellScrollRestoration("/dashboard", "/dashboard", 420, 1_000),
    {
      scrollTop: 420,
      pendingTop: null,
    },
  );
});

test("mobile shell retains history restoration while the container is short and applies it after growth", () => {
  const whileShort = resolveMobileShellScrollRestoration(
    "/dashboard",
    "/dashboard",
    420,
    0,
  );

  assert.deepEqual(whileShort, {
    scrollTop: 0,
    pendingTop: 420,
  });
  assert.deepEqual(
    resolveMobileShellScrollRestoration(
      "/dashboard",
      "/dashboard",
      whileShort.pendingTop ?? undefined,
      1_000,
    ),
    {
      scrollTop: 420,
      pendingTop: null,
    },
  );
});

test("mobile bottom navigation uses stable maximum safe-area geometry", async () => {
  const [tabs, css] = await Promise.all([
    readSource("src/components/ui/bottom-tab-bar.tsx"),
    readSource("src/app/globals.css"),
  ]);

  assert.match(css, /safe-area-max-inset-bottom/);
  assert.match(
    css,
    /bottom:\s*calc\(\s*env\(safe-area-inset-bottom,\s*0px\)\s*-\s*var\(--dk-safe-area-max-inset-bottom\)\s*\)/,
  );
  assert.match(tabs, /dk-mobile-bottom-nav/);
  assert.doesNotMatch(tabs, /pb-\[max\([^"'\]]*safe-area-inset-bottom/);
  assert.match(css, /--dk-mobile-app-tabbar-offset/);
});

test("decorative page backgrounds do not create viewport-fixed WebKit layers", async () => {
  const [appBackground, marketingShell] = await Promise.all([
    readSource("src/components/ui/AppBackground.tsx"),
    readSource("src/components/marketing/MarketingShell.tsx"),
  ]);

  assert.doesNotMatch(appBackground, /\bfixed\b/);
  assert.doesNotMatch(marketingShell, /pointer-events-none fixed/);
  assert.match(appBackground, /\babsolute\b/);
  assert.match(marketingShell, /pointer-events-none absolute/);
});

test("marketing navigation cannot leave an inline root-scroll override", async () => {
  const marketingHeader = await readSource(
    "src/components/marketing/MarketingHeader.tsx",
  );

  assert.match(marketingHeader, /if \(!isMobileMenuOpen\) return/);
  assert.match(marketingHeader, /getPropertyValue\("overflow"\)/);
  assert.match(marketingHeader, /removeProperty\("overflow"\)/);
  assert.doesNotMatch(
    marketingHeader,
    /document\.body\.style\.overflow = "unset"/,
  );
});

test("authenticated floating chrome leaves the iOS fixed-position path", async () => {
  const [help, uploadQueue, cookieBanner, css] = await Promise.all([
    readSource("src/components/help/HelpWidget.tsx"),
    readSource("src/components/providers/UploadQueueProvider.tsx"),
    readSource("src/components/policies/CookieConsentBanner.tsx"),
    readSource("src/app/globals.css"),
  ]);

  for (const source of [help, uploadQueue, cookieBanner]) {
    assert.match(source, /dk-mobile-floating-chrome/);
  }
  assert.match(
    css,
    /body:has\(\.dk-authenticated-shell\) \.dk-mobile-floating-chrome[\s\S]*position:\s*absolute/,
  );
});

test("authenticated mobile routes do not show a desktop recommendation", async () => {
  const layout = await readSource(
    "src/components/layouts/AuthenticatedLayout.tsx",
  );

  assert.doesNotMatch(layout, /MobileDesktopWarning/);
  assert.doesNotMatch(layout, /Desktop experience recommended/);
});
