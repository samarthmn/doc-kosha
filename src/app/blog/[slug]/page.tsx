import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import { notFound } from "next/navigation";
import React from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { clientEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import MarketingShell from "@/components/marketing/MarketingShell";
import GlassCard from "@/components/marketing/GlassCard";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CalendarBlank,
  Clock,
  ClockCounterClockwise,
  User,
} from "@phosphor-icons/react/ssr";
import TableOfContents from "@/components/blog/TableOfContents";
import ShareButton from "@/components/blog/ShareButton";
import { Badge } from "@/components/ui/badge";
import {
  getAllSlugs,
  getBlogPostBySlug,
  type BlogPost,
} from "@/modules/blog/server/blogRepository";
import { buildBreadcrumbListJsonLd } from "@/modules/seo/jsonLd";

type Props = PageProps<"/blog/[slug]">;

const parseSiteHost = (url: string): string | null => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

const siteUrl = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
const siteHost = parseSiteHost(siteUrl);
const internalBlogLinkHosts = new Set([
  "dockosha.com",
  "www.dockosha.com",
  ...(siteHost ? [siteHost] : []),
]);

const resolveInternalHref = (href: string): string | null => {
  if (!href.startsWith("http")) {
    return href;
  }

  try {
    const url = new URL(href);
    if (!internalBlogLinkHosts.has(url.host)) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

const getHeadingText = (children: React.ReactNode): string =>
  React.Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      if (React.isValidElement<{ children?: React.ReactNode }>(child)) {
        return getHeadingText(child.props.children);
      }
      return "";
    })
    .join(" ")
    .trim();

const createHeadingId = (children: React.ReactNode): string | undefined => {
  const rawText = getHeadingText(children);
  const slug = rawText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

  if (!slug) return undefined;
  return /^[a-z]/.test(slug) ? slug : `section-${slug}`;
};

const markdownComponents: Components = {
  a: ({ node, href, ...props }) => {
    const className = cn(
      "text-primary underline underline-offset-4 hover:text-primary/80",
      (props as { className?: string }).className,
    );
    const { children, title } = props as {
      children?: React.ReactNode;
      title?: string;
    };

    if (!href) {
      return <a {...props} className={className} />;
    }

    const internalHref = resolveInternalHref(href);

    if (!internalHref) {
      return (
        <a
          {...props}
          href={href}
          className={className}
          target="_blank"
          rel="nofollow noopener noreferrer"
        />
      );
    }

    return (
      <Link href={internalHref} className={className} title={title}>
        {children}
      </Link>
    );
  },
  h2: ({ node, ...props }) => (
    <h2
      {...props}
      id={createHeadingId(props.children)}
      className={cn(
        "mt-14 mb-5 scroll-mt-24 text-3xl font-medium tracking-[-0.025em]",
        props.className,
      )}
    />
  ),
  h3: ({ node, ...props }) => (
    <h3
      {...props}
      id={createHeadingId(props.children)}
      className={cn(
        "mt-10 mb-4 scroll-mt-24 text-2xl font-medium tracking-[-0.02em]",
        props.className,
      )}
    />
  ),
  p: ({ node, ...props }) => (
    <p
      {...props}
      className={cn(
        "mt-5 text-[0.96875rem] leading-7 text-muted-foreground",
        props.className,
      )}
    />
  ),
  ul: ({ node, ...props }) => (
    <ul
      {...props}
      className={cn(
        "mt-5 list-disc space-y-2 pl-6 text-[0.96875rem] leading-7 text-muted-foreground",
        props.className,
      )}
    />
  ),
  ol: ({ node, ...props }) => (
    <ol
      {...props}
      className={cn(
        "mt-5 list-decimal space-y-2 pl-6 text-[0.96875rem] leading-7 text-muted-foreground",
        props.className,
      )}
    />
  ),
  li: ({ node, ...props }) => (
    <li {...props} className={cn("marker:text-primary", props.className)} />
  ),
  blockquote: ({ node, ...props }) => (
    <blockquote
      {...props}
      className={cn(
        "mt-10 border-l-2 border-primary px-6 py-2 text-xl leading-8 font-medium text-foreground italic",
        props.className,
      )}
    />
  ),
  table: ({ node, ...props }) => (
    <div className="my-10 w-full overflow-x-auto rounded-lg border border-border bg-card/50 [box-shadow:var(--dk-shadow-card)]">
      <table
        {...props}
        className={cn("w-full text-left text-sm", props.className)}
      />
    </div>
  ),
  thead: ({ node, ...props }) => (
    <thead
      {...props}
      className={cn(
        "border-b border-border bg-muted/50 font-medium",
        props.className,
      )}
    />
  ),
  tr: ({ node, ...props }) => (
    <tr
      {...props}
      className={cn(
        "border-b border-border transition-colors last:border-0 hover:bg-muted/30",
        props.className,
      )}
    />
  ),
  th: ({ node, ...props }) => (
    <th
      {...props}
      className={cn("px-6 py-4 font-semibold text-foreground", props.className)}
    />
  ),
  td: ({ node, ...props }) => (
    <td {...props} className={cn("px-6 py-4 align-top", props.className)} />
  ),
  code: ({ children, className, ...props }) => {
    return (
      <code
        {...props}
        className={cn(
          "rounded-md bg-muted px-1.5 py-0.5 font-mono text-sm font-medium text-foreground",
          className,
        )}
      >
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre
      {...props}
      className={cn(
        "my-8 overflow-x-auto rounded-lg border border-border bg-secondary/50 p-6 text-sm [box-shadow:var(--dk-shadow-card)] [&>code]:bg-transparent [&>code]:p-0",
        props.className,
      )}
    >
      {children}
    </pre>
  ),
  hr: ({ node, ...props }) => (
    <hr {...props} className={cn("my-12 border-border", props.className)} />
  ),
};

const absoluteUrl = (value: string) => {
  if (!value) return undefined;
  return value.startsWith("http")
    ? value
    : `${siteUrl}${value.startsWith("/") ? "" : "/"}${value}`;
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(iso));

const isDifferentCalendarDate = (left: string, right: string): boolean => {
  const leftDate = new Date(left);
  const rightDate = new Date(right);

  return (
    leftDate.getUTCFullYear() !== rightDate.getUTCFullYear() ||
    leftDate.getUTCMonth() !== rightDate.getUTCMonth() ||
    leftDate.getUTCDate() !== rightDate.getUTCDate()
  );
};

const resolvePostUrl = (post: BlogPost) =>
  absoluteUrl(post.canonical ?? `/blog/${post.slug}`) ??
  `${siteUrl}/blog/${post.slug}`;

const articleJsonLd = (post: BlogPost) => {
  const postUrl = resolvePostUrl(post);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    author: {
      "@type": post.authorType,
      name: post.author ?? "DocKosha Editorial",
      url: siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "DocKosha",
      url: siteUrl,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": postUrl,
    },
    datePublished: post.dateISO,
    dateModified: post.updatedISO ?? post.dateISO,
    url: postUrl,
    image: absoluteUrl(post.heroImage ?? "/opengraph-image"),
    keywords: post.keywords.join(", "),
  };
};

export const dynamicParams = false;

export const revalidate = 3600;

export const generateStaticParams = async () =>
  getAllSlugs().map((slug) => ({
    slug,
  }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);

  if (!post) {
    return {
      title: "Post not found",
      description: "The requested article could not be found.",
      robots: { index: false, follow: false },
    };
  }

  const canonical = post.canonical ?? `/blog/${post.slug}`;
  const url = post.canonical ?? `${siteUrl}/blog/${post.slug}`;
  const ogImage = absoluteUrl(post.heroImage ?? "/opengraph-image");

  return {
    title: post.seoTitle ? { absolute: post.seoTitle } : post.title,
    description: post.description,
    alternates: { canonical },
    keywords: post.keywords,
    authors: post.author ? [{ name: post.author }] : undefined,
    openGraph: {
      type: "article",
      url,
      title: post.socialTitle ?? post.title,
      description: post.socialDescription ?? post.description,
      publishedTime: post.dateISO,
      modifiedTime: post.updatedISO ?? post.dateISO,
      tags: post.tags,
      images: ogImage
        ? [{ url: ogImage, alt: post.heroImageAlt ?? post.title }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: post.socialTitle ?? post.title,
      description: post.socialDescription ?? post.description,
      images: ogImage
        ? [{ url: ogImage, alt: post.heroImageAlt ?? post.title }]
        : undefined,
    },
  };
}

const BlogPostPage: React.FC<Props> = async ({ params }) => {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }
  const showUpdatedDate = Boolean(
    post.updatedISO && isDifferentCalendarDate(post.updatedISO, post.dateISO),
  );
  const breadcrumbJsonLd = buildBreadcrumbListJsonLd([
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: post.title, path: `/blog/${post.slug}` },
  ]);

  return (
    <MarketingShell>
      {/* Scroll Progress Bar could be added here later */}

      <article className="relative">
        {/* Header Section */}
        <section className="relative overflow-hidden py-16 sm:py-20 lg:py-28">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_78%_-12%,color-mix(in_srgb,var(--primary)_12%,transparent),transparent_62%)]" />

          <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
            <div className="animate-fade-in-up mb-7 flex flex-wrap gap-2 opacity-0 [--animation-delay:120ms]">
              {post.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="rounded-sm border-primary/25 bg-transparent px-2.5 py-1 text-[0.6875rem] font-medium tracking-[0.1em] text-primary uppercase"
                >
                  {tag}
                </Badge>
              ))}
            </div>

            <h1 className="animate-fade-in-up max-w-[16ch] text-[clamp(2.75rem,6vw,5rem)] leading-[1.06] font-medium tracking-[-0.035em] text-balance opacity-0 [--animation-delay:220ms]">
              {post.title}
            </h1>

            <p className="animate-fade-in-up mt-8 max-w-[58ch] text-[1.0625rem] leading-7 text-muted-foreground opacity-0 [--animation-delay:320ms]">
              {post.description}
            </p>

            <div className="animate-fade-in-up mt-10 flex flex-wrap items-center gap-6 text-sm text-muted-foreground opacity-0 [--animation-delay:420ms]">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-md border border-primary/20 bg-primary/5 text-primary">
                  <User aria-hidden className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-medium tracking-wide text-foreground uppercase">
                    Author
                  </p>
                  <p>{post.author ?? "DocKosha Editorial"}</p>
                </div>
              </div>

              <div className="hidden h-8 w-px bg-border sm:block" />

              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-md border border-primary/20 bg-primary/5 text-primary">
                  <CalendarBlank aria-hidden className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-medium tracking-wide text-foreground uppercase">
                    Published
                  </p>
                  <time dateTime={post.dateISO}>
                    {formatDate(post.dateISO)}
                  </time>
                </div>
              </div>

              {showUpdatedDate && post.updatedISO ? (
                <>
                  <div className="hidden h-8 w-px bg-border sm:block" />

                  <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-md border border-primary/20 bg-primary/5 text-primary">
                      <ClockCounterClockwise aria-hidden className="h-4 w-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-medium tracking-wide text-foreground uppercase">
                        Updated
                      </p>
                      <time dateTime={post.updatedISO}>
                        {formatDate(post.updatedISO)}
                      </time>
                    </div>
                  </div>
                </>
              ) : null}

              <div className="hidden h-8 w-px bg-border sm:block" />

              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-md border border-primary/20 bg-primary/5 text-primary">
                  <Clock aria-hidden className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-medium tracking-wide text-foreground uppercase">
                    Read Time
                  </p>
                  <span>{post.readingTimeMinutes} min read</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Content Section */}
        <section className="mx-auto max-w-[1200px] px-5 pb-24 sm:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_230px] lg:gap-14 xl:grid-cols-[160px_minmax(0,1fr)_230px]">
            {/* Left Sidebar - Navigation (Desktop) */}
            <div className="hidden xl:block">
              <div className="sticky top-24">
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="-ml-3 text-muted-foreground hover:text-primary"
                >
                  <Link href="/blog">
                    <ArrowLeft aria-hidden className="mr-2 h-4 w-4" />
                    Back to blog
                  </Link>
                </Button>
              </div>
            </div>

            {/* Main Content */}
            <div className="min-w-0">
              {post.heroImage ? (
                <figure className="mb-10 overflow-hidden rounded-lg border border-border">
                  <img
                    src={post.heroImage}
                    alt={post.heroImageAlt ?? post.title}
                    width={post.heroImageWidth}
                    height={post.heroImageHeight}
                    className="h-auto w-full"
                    decoding="async"
                  />
                </figure>
              ) : null}
              <div className="prose prose-lg dark:prose-invert prose-headings:scroll-mt-24 prose-primary max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {post.content}
                </ReactMarkdown>
              </div>

              {post.authorBio ? (
                <p className="mt-12 border-t border-border pt-6 text-sm leading-6 text-muted-foreground">
                  {post.authorBio}
                </p>
              ) : null}

              <hr className="my-16 border-border" />

              {/* Post Footer / CTA */}
              <GlassCard className="p-6 sm:p-8">
                <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-medium">
                      Enjoyed this article?
                    </h3>
                    <p className="text-muted-foreground">
                      Share it with your network or read more insights.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <ShareButton
                      title={post.title}
                      description={post.description}
                      url={`${siteUrl}/blog/${post.slug}`}
                    />
                    <Button asChild size="lg">
                      <Link href="/blog">Read More</Link>
                    </Button>
                  </div>
                </div>
              </GlassCard>
            </div>

            {/* Right Sidebar - TOC (Desktop) */}
            <div className="hidden lg:block">
              <div className="sticky top-24 pt-4">
                <TableOfContents />
              </div>
            </div>
          </div>
        </section>
      </article>

      <Script
        id={`blog-ld-${post.slug}`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(articleJsonLd(post)),
        }}
      />
      <Script
        id={`blog-breadcrumb-ld-${post.slug}`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd),
        }}
      />
    </MarketingShell>
  );
};

export default BlogPostPage;
