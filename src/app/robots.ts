import type { MetadataRoute } from "next";

const appUrl = (
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
).replace(/\/$/, "");

// Index only marketing/legal pages; keep product and link viewers out of search.
export default function robots(): MetadataRoute.Robots {
  const privateDisallow = [
    "/api",
    "/auth",
    "/billing",
    "/onboarding",
    "/dashboard",
    "/documents",
    "/data-rooms",
    "/settings",
    "/stripe",
    "/d/",
    "/r/",
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: privateDisallow,
      },
      {
        userAgent: "OAI-SearchBot",
        allow: "/",
        disallow: privateDisallow,
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
