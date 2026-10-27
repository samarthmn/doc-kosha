import type { MetadataRoute } from "next";
import { source } from "@/lib/source";
import { getDocsSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getDocsSiteUrl();
  return source.getPages().map((page) => ({
    url: new URL(page.url, origin).href,
  }));
}
