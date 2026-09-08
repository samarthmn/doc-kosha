import { NextResponse } from "next/server";
import { clientEnv } from "@/lib/env";
import { getAllBlogPosts } from "@/modules/blog/server/blogRepository";

const siteUrl = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

const escapeCdata = (value: string) =>
  value.replaceAll("]]>", "]]]]><![CDATA[>");

const buildRssFeed = () => {
  const posts = getAllBlogPosts();
  const items = posts
    .map((post) => {
      const url = `${siteUrl}/blog/${post.slug}`;
      return `
        <item>
          <title><![CDATA[${escapeCdata(post.title)}]]></title>
          <link>${url}</link>
          <guid isPermaLink="true">${url}</guid>
          <pubDate>${new Date(post.dateISO).toUTCString()}</pubDate>
          <description><![CDATA[${escapeCdata(post.excerpt || post.description)}]]></description>
        </item>
      `.trim();
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title><![CDATA[DocKosha Blog]]></title>
    <link>${siteUrl}/blog</link>
    <description><![CDATA[Secure document sharing, virtual data room, and analytics insights from DocKosha.]]></description>
    <language>en-us</language>
    <ttl>120</ttl>
    ${items}
  </channel>
</rss>`;
};

export const revalidate = 1800;

export const GET = () => {
  const body = buildRssFeed();
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "s-maxage=1800, stale-while-revalidate",
    },
  });
};
