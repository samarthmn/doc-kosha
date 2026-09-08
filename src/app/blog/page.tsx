import type { Metadata } from "next";
import Link from "next/link";
import { clientEnv } from "@/lib/env";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import GlassCard from "@/components/marketing/GlassCard";
import { Button } from "@/components/ui/button";
import FeaturedPostCard from "@/components/blog/FeaturedPostCard";
import BlogCard from "@/components/blog/BlogCard";
import {
  BLOG_PAGE_SIZE,
  paginateBlogPosts,
} from "@/modules/blog/server/blogRepository";

type Props = PageProps<"/blog">;

const siteUrl = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
const baseTitle =
  "DocKosha Blog — M&A, Founder Data Room, and Secure Sharing Guides";
const baseDescription =
  "Answer-first guides on M&A data rooms, founder investor rooms, lawyer document sharing, fundraising workflows, privacy-first analytics, and practical upgrade paths.";

const baseMetadata: Metadata = {
  title: baseTitle,
  description: baseDescription,
  alternates: { canonical: "/blog" },
  keywords: [
    "free virtual data room",
    "M&A data room",
    "founder data room",
    "investor data room",
    "fundraising data room",
    "legal document sharing",
    "free secure document sharing",
    "free data room software",
    "virtual data room",
    "secure document sharing",
    "DocSend alternative",
    "document analytics",
    "document watermarking",
    "due diligence",
  ],
  openGraph: {
    type: "website",
    title: baseTitle,
    description: baseDescription,
    url: `${siteUrl}/blog`,
  },
  twitter: {
    card: "summary_large_image",
    title: baseTitle,
    description: baseDescription,
  },
};

const parsePageParam = (raw: string | string[] | undefined) => {
  if (!raw) return 1;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const pageHref = (page: number) => (page <= 1 ? "/blog" : `/blog?page=${page}`);

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const params = await searchParams;
  const page = parsePageParam(params?.page);

  if (page <= 1) {
    return baseMetadata;
  }

  const title = `${baseTitle} (Page ${page})`;
  const description = `${baseDescription} Page ${page}.`;

  return {
    ...baseMetadata,
    title,
    description,
    alternates: { canonical: `/blog?page=${page}` },
    openGraph: {
      ...(baseMetadata.openGraph ?? {}),
      title,
      description,
      url: `${siteUrl}/blog?page=${page}`,
    },
  };
}

const BlogPage: React.FC<Props> = async ({ searchParams }) => {
  const params = await searchParams;
  const pageParam = parsePageParam(params?.page);
  // Fetch one extra post to determine if we have a feature post on first page
  const pagination = paginateBlogPosts(pageParam, BLOG_PAGE_SIZE);
  const hasPosts = pagination.totalPosts > 0;

  // Logic for Featured Post:
  // We take the first post of the FIRST page as the featured post.
  // The rest are displayed in the grid.
  const isFirstPage = pagination.page === 1;
  const postsToShow =
    isFirstPage && hasPosts ? pagination.posts.slice(1) : pagination.posts;
  const featuredPost = isFirstPage && hasPosts ? pagination.posts[0] : null;

  return (
    <MarketingShell>
      <MarketingHero
        badge="Blog"
        title="M&A, founder data room, and secure sharing insights"
        subtitle="Practical, answer-first posts on M&A data rooms, founder investor rooms, lawyer document sharing, fundraising controls, and when to upgrade from basic links to room-based workflows."
      />

      <section className="pb-24">
        <div className="mx-auto max-w-[1200px] space-y-14 px-5 sm:px-8">
          {!hasPosts ? (
            <GlassCard className="border-dashed p-8 sm:p-12">
              <div className="max-w-md space-y-4">
                <h2 className="text-2xl font-medium">Blog launches soon</h2>
                <p className="text-muted-foreground">
                  We&apos;re publishing new guides on free virtual data rooms,
                  founder data rooms, lawyer document sharing, fundraising
                  workflows, and privacy-first review controls.
                </p>
              </div>
            </GlassCard>
          ) : (
            <>
              {featuredPost && (
                <div className="animate-fade-in-up opacity-0 [--animation-delay:200ms]">
                  <FeaturedPostCard post={featuredPost} />
                </div>
              )}

              {postsToShow.length > 0 && (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {postsToShow.map((post, index) => (
                    <div
                      key={post.slug}
                      className="animate-fade-in-up opacity-0"
                      style={{
                        animationDelay: `${(index + (featuredPost ? 2 : 1)) * 100}ms`,
                      }}
                    >
                      <BlogCard post={post} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {hasPosts && pagination.totalPages > 1 && (
            <nav
              className="flex items-center justify-center gap-4"
              aria-label="Blog pagination"
            >
              {pagination.page === 1 ? (
                <Button variant="outline" size="default" disabled>
                  Newer
                </Button>
              ) : (
                <Button variant="outline" size="default" asChild>
                  <Link href={pageHref(pagination.page - 1)}>Newer</Link>
                </Button>
              )}
              <span className="text-sm font-medium text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              {pagination.page === pagination.totalPages ? (
                <Button variant="outline" size="default" disabled>
                  Older
                </Button>
              ) : (
                <Button variant="outline" size="default" asChild>
                  <Link href={pageHref(pagination.page + 1)}>Older</Link>
                </Button>
              )}
            </nav>
          )}
        </div>
      </section>
    </MarketingShell>
  );
};

export default BlogPage;
