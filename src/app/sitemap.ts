import type { MetadataRoute } from "next";
import { getAllBlogPosts } from "@/modules/blog/server/blogRepository";
import { getAllDemoWorkflows } from "@/modules/demos/catalog";
import { customerStories } from "@/content/customerStories";

const rawUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const appUrl = rawUrl.replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const demoPages = [
    "/demos",
    ...getAllDemoWorkflows().map((workflow) => `/demos/${workflow.slug}`),
  ];
  const marketingPages = [
    "/",
    "/about",
    "/features",
    "/features/data-room",
    "/features/single-document",
    "/features/watermarking",
    "/features/nda",
    "/features/custom-url",
    "/features/redaction",
    ...demoPages,
    "/docyantra",
    "/free-virtual-data-room",
    "/secure-document-sharing",
    "/dockosha-facts",
    "/hosted-vs-self-hosted",
    "/security",
    "/security/subprocessors",
    "/security/questionnaire",
    "/security/dpa",
    "/pricing",
    "/faq",
    "/contact",
    ...customerStories.map((story) => story.href),
    "/data-request",
    "/privacy-policy",
    "/cookie-policy",
    "/terms-and-conditions",
    "/blog",
    "/blog/rss.xml",
  ];

  const posts = getAllBlogPosts();

  const marketingEntries: MetadataRoute.Sitemap = marketingPages.map(
    (path) => ({
      url: `${appUrl}${path}`,
      lastModified,
      changeFrequency: path === "/" ? "weekly" : "monthly",
      priority: path === "/" ? 1 : 0.6,
    }),
  );

  const blogEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${appUrl}/blog/${post.slug}`,
    lastModified: post.updatedISO ?? post.dateISO,
    changeFrequency: "monthly",
    priority: 0.65,
  }));

  return [...marketingEntries, ...blogEntries];
}
