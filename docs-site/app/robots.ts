import type { MetadataRoute } from "next";
import { getDocsSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/docs", disallow: "/api/" },
    sitemap: new URL("/sitemap.xml", getDocsSiteUrl()).href,
  };
}
