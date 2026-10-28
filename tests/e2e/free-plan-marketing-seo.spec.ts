import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { blockExternalRequests, readJsonLdById } from "./helpers/marketing";

const blogRoot = path.join(process.cwd(), "src/content/blog");
const freePlanSlug = "dockosha-free-forever-data-room-plan";
const freePlanTitle =
  "DocKosha Free Plan for Secure Document Sharing and Lightweight Data Rooms";
const refreshedLegacySlug = "vdr-pricing-realism-total-cost-of-ownership";
const refreshedLegacyTitle =
  "Pricing realism: total cost of ownership across leading VDRs";

const refreshedBlogFiles = [
  {
    file: "data-room-analytics-that-actually-matter.md",
    date: "2026-03-04",
  },
  {
    file: "dockosha-vs-docsend-fundraising-diligence.md",
    date: "2025-12-16",
  },
  {
    file: "dockosha-vs-papermark-feature-comparison.md",
    date: "2025-12-16",
  },
  {
    file: "docsend-vs-real-deal-room-lower-middle-market.md",
    date: "2026-03-11",
  },
  {
    file: "due-diligence-qa-workflows-with-analytics.md",
    date: "2025-12-16",
  },
  {
    file: "enterprise-vdr-vs-lighter-deal-room-lower-middle-market.md",
    date: "2026-03-09",
  },
  {
    file: "firmex-alternative-smaller-deal-teams.md",
    date: "2026-03-12",
  },
  {
    file: "ideals-alternative-boutique-ma-advisory-firms.md",
    date: "2026-03-13",
  },
  {
    file: "investor-ready-virtual-data-room-branding.md",
    date: "2025-12-16",
  },
  {
    file: "nda-gated-diligence-room-without-slowing-buyers.md",
    date: "2026-03-06",
  },
  {
    file: "permissions-client-facing-diligence-room.md",
    date: "2026-03-07",
  },
  {
    file: "privacy-first-analytics-investors-informed.md",
    date: "2025-12-16",
  },
  {
    file: "repeatable-sell-side-data-room-lower-middle-market.md",
    date: "2026-03-08",
  },
  {
    file: "secure-collaboration-remote-deal-rooms.md",
    date: "2025-12-16",
  },
  {
    file: "secure-document-sharing-playbook-2025.md",
    date: "2025-12-16",
  },
  {
    file: "startup-fundraising-telemetry-investor-metrics.md",
    date: "2025-12-16",
  },
  {
    file: "vdr-pricing-realism-total-cost-of-ownership.md",
    date: "2025-12-16",
  },
  {
    file: "virtual-data-room-pricing-boutique-advisory-firms.md",
    date: "2026-03-10",
  },
  {
    file: "virtual-data-room-security-checklist.md",
    date: "2025-12-16",
  },
  {
    file: "watermark-diligence-documents-boutique-advisory-firms.md",
    date: "2026-03-05",
  },
] as const;

type JsonLd = Record<string, unknown>;

const readFrontmatterField = (fileName: string, fieldName: string) => {
  const raw = fs.readFileSync(path.join(blogRoot, fileName), "utf8");
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1] ?? "";
  const match = new RegExp(`^${fieldName}:\\s*["']?([^"'\n]+)["']?`, "m").exec(
    frontmatter,
  );

  return match?.[1] ?? null;
};

test.describe("free-plan marketing SEO @cloud", () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
  });

  test("homepage SEO introduces open source while preserving M&A and founder sharing discovery", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(
      /Open-Source Document Sharing & Virtual Data Rooms/,
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Virtual data rooms for M&A teams and founders/,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Free forever plan now available."),
    ).toBeVisible();
    const heroStartLink = page.locator("main a[href^='/auth/sign-in']").first();
    await expect(heroStartLink).toHaveAttribute("href", /source=landing_page/);
    await expect(heroStartLink).not.toHaveAttribute("href", /variant=/);

    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    expect(bodyText).toContain("m&a advisors");
    expect(bodyText).toContain("founders");
    expect(bodyText).toContain("lawyers and fundraising");
    expect(bodyText).toContain("secure document sharing");
    expect(bodyText).toContain("free plan");

    // Dev-mode hydration can transiently duplicate this section; wait for the
    // DOM to settle before strict-mode content assertions.
    const testimonials = page.getByTestId("homepage-testimonials");
    await expect(testimonials).toHaveCount(1);
    await expect(testimonials).toContainText("I first tried DocSend");
    await expect(testimonials).toContainText("GL HF SRL");
    await expect(
      testimonials.getByRole("link", { name: "Read customer story" }),
    ).toHaveAttribute("href", "/customers/gl-hf-docsend-alternative");

    const softwareJsonLd = await readJsonLdById<{
      "@type"?: string;
      description?: string;
      review?: Array<{ reviewBody?: string }>;
    }>(page, "ld-software-reviews");
    expect(softwareJsonLd["@type"]).toBe("SoftwareApplication");
    expect(String(softwareJsonLd.description ?? "")).toContain(
      "M&A teams and founders",
    );
    expect(String(softwareJsonLd.description ?? "")).toContain(
      "Lawyers and fundraising teams",
    );
    expect(softwareJsonLd.review?.[0]?.reviewBody).toContain("DocSend");
    expect(softwareJsonLd.review?.[0]?.reviewBody).toContain("DocKosha");
  });

  test("open-source transparency links both repositories and preserves the Cloud signup", async ({
    page,
  }) => {
    await page.goto("/");
    const transparency = page.getByRole("region", {
      name: "Open source, from application to engine",
    });
    await expect(
      transparency.getByRole("link", {
        name: "DocKosha on GitHub",
        exact: true,
      }),
    ).toHaveAttribute("href", "https://github.com/samarthmn/doc-kosha");
    await expect(
      transparency.getByRole("link", {
        name: "DocYantra on GitHub",
        exact: true,
      }),
    ).toHaveAttribute("href", "https://github.com/samarthmn/doc-yantra");
    await expect(
      transparency.getByRole("link", { name: "Self-hosting guide" }),
    ).toHaveAttribute("href", "/self-hosting");
    await expect(
      page
        .locator("footer")
        .getByRole("link", { name: "DocYantra on GitHub", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator("main a[href^='/auth/sign-in']").first(),
    ).toBeVisible();
    expect((await page.title()).match(/DocKosha/g)).toHaveLength(1);
    const website = await readJsonLdById<JsonLd>(page, "ld-website");
    expect(website).not.toHaveProperty("potentialAction");
  });

  test("self-hosting is discoverable with accurate setup boundaries and canonical metadata", async ({
    page,
  }) => {
    await page.goto("/self-hosting");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Self-host DocKosha with the source in your hands",
    );
    await expect(page.locator("main")).toContainText("0.0.28");
    await expect(page.locator("main")).toContainText("read:packages");
    await expect(page.locator("main")).toContainText(
      "not officially supported",
    );
    await expect(
      page.getByRole("link", { name: "Read the complete setup guide" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/samarthmn/doc-kosha/blob/HEAD/docs/self-hosting.md",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new URL("/self-hosting", process.env.PLAYWRIGHT_BASE_URL).toString(),
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      new URL("/self-hosting", process.env.PLAYWRIGHT_BASE_URL).toString(),
    );
    await expect(
      page.locator("main a[href^='/auth/sign-in']").first(),
    ).toContainText("Start free");
    await page.goto("/docyantra");
    await expect(page.locator("main")).not.toContainText(
      "not a standalone product or externally available",
    );
    await expect(
      page
        .locator("main")
        .getByRole("link", { name: "DocYantra on GitHub", exact: true })
        .first(),
    ).toBeVisible();
  });

  test("core marketing pages have distinct titles and canonical social URLs", async ({
    page,
  }) => {
    const paths = [
      "/",
      "/about",
      "/pricing",
      "/docyantra",
      "/self-hosting",
      "/hosted-vs-self-hosted",
      "/features",
      "/free-virtual-data-room",
      "/secure-document-sharing",
      "/faq",
      "/dockosha-facts",
      "/security",
      "/security/questionnaire",
      "/security/subprocessors",
      "/security/dpa",
    ];
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const path of paths) {
      const response = await page.goto(path);
      expect(response?.ok(), path).toBeTruthy();
      const title = await page.title();
      expect(titles.has(title), path).toBeFalsy();
      expect(title.match(/DocKosha/g), path).toHaveLength(1);
      titles.add(title);
      const description = await page
        .locator('meta[name="description"]')
        .getAttribute("content");
      expect(description?.length, path).toBeGreaterThan(20);
      expect(descriptions.has(description!), path).toBeFalsy();
      descriptions.add(description!);
      const canonical = new URL(path, process.env.PLAYWRIGHT_BASE_URL).href;
      const canonicalHref = await page
        .locator('link[rel="canonical"]')
        .getAttribute("href");
      const socialHref = await page
        .locator('meta[property="og:url"]')
        .getAttribute("content");
      expect(new URL(canonicalHref!).href, path).toBe(canonical);
      expect(new URL(socialHref!).href, path).toBe(canonical);
      const socialDescription = await page
        .locator('meta[property="og:description"]')
        .getAttribute("content");
      expect(socialDescription?.length, path).toBeGreaterThan(20);
      await expect(
        page.locator('meta[name="twitter:description"]'),
        path,
      ).toHaveAttribute("content", socialDescription!);
    }
  });

  test("free-plan blog post has one H1, no duplicate title heading, and complete BlogPosting JSON-LD", async ({
    page,
  }) => {
    await page.goto(`/blog/${freePlanSlug}`);

    await expect(
      page.getByRole("heading", { level: 1, name: freePlanTitle }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: freePlanTitle }),
    ).toHaveCount(1);

    const article = page.locator("article");
    expect(
      await article.locator("a[href='/free-virtual-data-room']").count(),
    ).toBeGreaterThan(0);
    expect(await article.locator("a[href='/pricing']").count()).toBeGreaterThan(
      0,
    );
    expect(
      await article.locator("a[href='/security']").count(),
    ).toBeGreaterThan(0);

    const jsonLd = await readJsonLdById<JsonLd>(
      page,
      `blog-ld-${freePlanSlug}`,
    );
    expect(jsonLd?.["@type"]).toBe("BlogPosting");
    expect(jsonLd?.headline).toBe(freePlanTitle);

    const publisher =
      jsonLd?.publisher && typeof jsonLd.publisher === "object"
        ? (jsonLd.publisher as JsonLd)
        : null;
    expect(publisher?.["@type"]).toBe("Organization");
    expect(publisher?.name).toBe("DocKosha");

    const mainEntity =
      jsonLd?.mainEntityOfPage && typeof jsonLd.mainEntityOfPage === "object"
        ? (jsonLd.mainEntityOfPage as JsonLd)
        : null;
    expect(mainEntity?.["@type"]).toBe("WebPage");
    expect(String(mainEntity?.["@id"] ?? "")).toContain(
      `/blog/${freePlanSlug}`,
    );
    expect(String(jsonLd?.url ?? "")).toContain(`/blog/${freePlanSlug}`);
  });

  test("refreshed legacy blog posts keep original publish dates and expose updated dates", async ({
    page,
  }) => {
    for (const post of refreshedBlogFiles) {
      const raw = fs.readFileSync(path.join(blogRoot, post.file), "utf8");

      expect(readFrontmatterField(post.file, "date")).toBe(post.date);
      expect(readFrontmatterField(post.file, "updated")).toBe(
        post.file === "dockosha-vs-papermark-feature-comparison.md"
          ? "2026-10-27"
          : "2026-06-01",
      );
      expect(raw).toContain("/free-virtual-data-room");
      expect(raw).toContain("/pricing");
      expect(raw).toContain("/security");
    }

    await page.goto(`/blog/${refreshedLegacySlug}`);

    await expect(
      page.getByRole("heading", { level: 1, name: refreshedLegacyTitle }),
    ).toBeVisible();

    const article = page.locator("article");
    await expect(article.getByText("Published")).toBeVisible();
    await expect(article.getByText("December 16, 2025")).toBeVisible();
    await expect(article.getByText("Updated")).toBeVisible();
    await expect(article.getByText("June 1, 2026")).toBeVisible();

    expect(
      await article.locator("a[href='/free-virtual-data-room']").count(),
    ).toBeGreaterThan(0);
    expect(await article.locator("a[href='/pricing']").count()).toBeGreaterThan(
      0,
    );
    expect(
      await article.locator("a[href='/security']").count(),
    ).toBeGreaterThan(0);

    const jsonLd = await readJsonLdById<JsonLd>(
      page,
      `blog-ld-${refreshedLegacySlug}`,
    );
    expect(jsonLd?.["@type"]).toBe("BlogPosting");
    expect(jsonLd?.headline).toBe(refreshedLegacyTitle);
    expect(String(jsonLd?.datePublished ?? "")).toContain("2025-12-16");
    expect(String(jsonLd?.dateModified ?? "")).toContain("2026-06-01");
  });

  test("self-referencing absolute blog links render as internal followed links", async ({
    page,
  }) => {
    await page.goto("/blog/dockosha-vs-docsend");

    const article = page.locator("article");
    const internalFeatureLink = article.locator("a[href='/features']").first();
    await expect(internalFeatureLink).toBeVisible();
    await expect(internalFeatureLink).not.toHaveAttribute("target", "_blank");
    await expect(internalFeatureLink).not.toHaveAttribute("rel", /nofollow/);

    const externalDocSendLink = article
      .locator("a[href^='https://www.docsend.com']")
      .first();
    await expect(externalDocSendLink).toBeVisible();
    await expect(externalDocSendLink).toHaveAttribute("target", "_blank");
    await expect(externalDocSendLink).toHaveAttribute("rel", /nofollow/);
  });

  test("robots and sitemap expose core marketing SEO entries", async ({
    page,
  }) => {
    const robotsResponse = await page.goto("/robots.txt");
    expect(robotsResponse?.ok()).toBeTruthy();

    const robotsBody = (await page.locator("body").textContent()) ?? "";
    const normalizedRobots = robotsBody.toLowerCase();
    expect(normalizedRobots).toContain("user-agent: *");
    expect(normalizedRobots).toContain("disallow: /api");
    expect(normalizedRobots).toContain("user-agent: oai-searchbot");
    expect(normalizedRobots).toContain("disallow: /d/");
    expect(normalizedRobots).not.toContain("disallow: /dockosha-facts");
    expect(normalizedRobots).toContain("sitemap:");
    expect(normalizedRobots).toContain("/sitemap.xml");

    const sitemapResponse = await page.goto("/sitemap.xml");
    expect(sitemapResponse?.ok()).toBeTruthy();
    const sitemapXml = await sitemapResponse!.text();
    const homepageEntry = sitemapXml.match(
      /<url>\s*<loc>[^<]+\/<\/loc>[\s\S]*?<\/url>/,
    )?.[0];
    expect(homepageEntry).toBeTruthy();
    expect(homepageEntry).not.toContain("<lastmod>");

    const sitemapBody = (await page.locator("body").textContent()) ?? "";
    expect(sitemapBody).toContain("/blog</loc>");
    expect(sitemapBody).toContain("/free-virtual-data-room</loc>");
    expect(sitemapBody).toContain("/secure-document-sharing</loc>");
    expect(sitemapBody).toContain("/dockosha-facts</loc>");
    expect(sitemapBody).toContain("/self-hosting</loc>");
    expect(sitemapBody).toContain(`/blog/${freePlanSlug}</loc>`);
  });

  test("free-plan discovery pages expose expected free/security/pricing discovery links", async ({
    page,
  }) => {
    const candidatePages = [
      "/free-virtual-data-room",
      "/secure-document-sharing",
      "/dockosha-facts",
    ] as const;

    for (const route of candidatePages) {
      const response = await page.goto(route, {
        waitUntil: "domcontentloaded",
      });
      const status = response?.status() ?? 0;
      // The sitemap test above advertises these routes, so a 404 here must
      // fail loudly instead of silently skipping the coverage.
      expect(status, `${route} should return 200`).toBe(200);

      const bodyText = (await page.locator("body").innerText()).toLowerCase();
      expect(bodyText).toContain("free");
      expect(bodyText).toMatch(/virtual data room|secure document sharing/);

      const routeBody = page.locator("body");
      expect(
        await routeBody.locator("a[href='/pricing']").count(),
      ).toBeGreaterThan(0);
      expect(
        await routeBody.locator("a[href='/security']").count(),
      ).toBeGreaterThan(0);
    }
  });
});

test.describe("customer story SEO @cloud", () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
  });

  test("customer story page publishes the approved quote and article JSON-LD", async ({
    page,
  }) => {
    await page.goto("/customers/gl-hf-docsend-alternative");

    await expect(
      page.getByRole("heading", {
        name: "Why GL HF chose DocKosha as a lower-cost DocSend alternative",
      }),
    ).toBeVisible();
    await expect(page.getByText("I first tried DocSend")).toBeVisible();
    await expect(page.getByText("Lucas", { exact: true })).toBeVisible();

    const jsonLd = await readJsonLdById<{
      "@type"?: string;
      headline?: string;
      citation?: { reviewBody?: string };
    }>(page, "gl-hf-customer-story-jsonld");

    expect(jsonLd["@type"]).toBe("Article");
    expect(jsonLd.headline).toContain("GL HF");
    expect(jsonLd.citation?.reviewBody).toContain("Didn't expect anything");
  });
});
