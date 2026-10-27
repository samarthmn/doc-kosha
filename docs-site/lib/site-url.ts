/** Public origin used by canonical links, social metadata, robots and sitemap. */
export function getDocsSiteUrl(value = process.env.DOCS_SITE_URL): URL {
  const url = new URL(value?.trim() || "https://docs.dockosha.com");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "DOCS_SITE_URL must be an HTTP(S) origin without a path or credentials",
    );
  }
  return url;
}
