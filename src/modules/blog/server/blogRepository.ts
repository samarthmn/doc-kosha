import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import matter from "gray-matter";
import { z } from "zod";

const BLOG_ROOT = path.join(process.cwd(), "src/content/blog");
export const BLOG_PAGE_SIZE = 10;

const isoDateSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid ISO date string",
  });

const blogFrontmatterSchema = z.object({
  title: z.string().min(1),
  seoTitle: z.string().min(1).optional(),
  socialTitle: z.string().min(1).optional(),
  socialDescription: z.string().min(1).optional(),
  description: z.string().min(1),
  date: isoDateSchema,
  updated: isoDateSchema.optional(),
  author: z.string().optional(),
  authorType: z
    .enum(["Person", "Organization"])
    .optional()
    .default("Organization"),
  authorBio: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  keywords: z.array(z.string()).optional().default([]),
  slug: z.string().optional(),
  canonical: z.string().url().optional(),
  heroImage: z.string().optional(),
  heroImageAlt: z.string().optional(),
  heroImageWidth: z.number().int().positive().optional(),
  heroImageHeight: z.number().int().positive().optional(),
  featured: z.boolean().optional().default(false),
});

type BlogFrontmatter = z.infer<typeof blogFrontmatterSchema>;

export interface BlogPost extends BlogFrontmatter {
  slug: string;
  content: string;
  excerpt: string;
  wordCount: number;
  readingTimeMinutes: number;
  dateISO: string;
  updatedISO?: string;
}

interface PaginatedBlogPosts {
  posts: BlogPost[];
  page: number;
  pageSize: number;
  totalPosts: number;
  totalPages: number;
}

const computeExcerpt = (content: string) => {
  const clean = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const raw = clean.slice(0, 3).join(" ");
  if (raw.length <= 240) {
    return raw;
  }
  return `${raw.slice(0, 237).trim()}…`;
};

const computeReadingTime = (text: string) => {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
};

const normalizeHeadingValue = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const stripLeadingDuplicateTitleH1 = (content: string, title: string) => {
  const match = /^\s*#\s+(.+?)\s*(?:\r?\n|$)/.exec(content);
  if (!match) {
    return content;
  }

  const headingValue = (match[1] ?? "").replace(/\s+#+\s*$/, "").trim();
  if (!headingValue) {
    return content;
  }

  if (normalizeHeadingValue(headingValue) !== normalizeHeadingValue(title)) {
    return content;
  }

  return content.slice(match[0].length).replace(/^\s*\r?\n/, "");
};

const readPostFromFile = (filePath: string): BlogPost => {
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  const parsed = blogFrontmatterSchema.parse(data);
  const fallbackSlug = path.basename(filePath).replace(/\.md$/, "");
  const slug = parsed.slug ?? fallbackSlug;
  const normalizedContent = stripLeadingDuplicateTitleH1(content, parsed.title);
  const wordCount = normalizedContent.split(/\s+/).filter(Boolean).length;
  return {
    ...parsed,
    slug,
    content: normalizedContent,
    excerpt: computeExcerpt(normalizedContent),
    wordCount,
    readingTimeMinutes: computeReadingTime(normalizedContent),
    dateISO: new Date(parsed.date).toISOString(),
    updatedISO: parsed.updated
      ? new Date(parsed.updated).toISOString()
      : undefined,
  };
};

const loadPosts = (): BlogPost[] => {
  if (!fs.existsSync(BLOG_ROOT)) {
    return [];
  }
  return fs
    .readdirSync(BLOG_ROOT)
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) => readPostFromFile(path.join(BLOG_ROOT, fileName)))
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO));
};

const cachedPosts = cache(loadPosts);

export const getAllBlogPosts = () => cachedPosts();

export const getBlogPostBySlug = cache((slug: string) => {
  return cachedPosts().find((post) => post.slug === slug) ?? null;
});

export const getAllSlugs = () => cachedPosts().map((post) => post.slug);

export const paginateBlogPosts = (
  page: number,
  pageSize: number = BLOG_PAGE_SIZE,
): PaginatedBlogPosts => {
  const normalizedPage =
    Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const posts = cachedPosts();
  const totalPosts = posts.length;
  const totalPages = Math.max(1, Math.ceil(totalPosts / pageSize));
  const currentPage = Math.min(normalizedPage, totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;

  return {
    posts: posts.slice(start, end),
    page: currentPage,
    pageSize,
    totalPosts,
    totalPages,
  };
};
