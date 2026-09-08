import React from "react";
import Link from "next/link";
import { ArrowRight, CalendarBlank, Clock } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import GlassCard from "@/components/marketing/GlassCard";
import { Badge } from "@/components/ui/badge";
import type { BlogPost } from "@/modules/blog/server/blogRepository";

interface BlogCardProps {
  post: BlogPost;
  className?: string;
}

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));

const BlogCard: React.FC<BlogCardProps> = ({ post, className }) => {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className={cn(
        "group block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      <GlassCard className="flex h-full flex-col overflow-hidden">
        <div className="flex flex-1 flex-col p-6 sm:p-8">
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            {post.tags.slice(0, 1).map((tag) => (
              <Badge
                key={tag}
                className="text-[0.6875rem] tracking-[0.1em] uppercase"
              >
                {tag}
              </Badge>
            ))}
            <span className="flex items-center gap-1.5 text-[0.6875rem] font-medium tracking-[0.1em] text-muted-foreground uppercase">
              <CalendarBlank aria-hidden className="h-3 w-3" />
              {formatDate(post.dateISO)}
            </span>
          </div>

          <h3 className="mb-3 text-lg leading-snug font-medium tracking-[-0.01em] transition-colors duration-200 group-hover:text-primary motion-reduce:transition-none md:text-xl">
            {post.title}
          </h3>

          <p className="mb-6 line-clamp-3 max-w-[58ch] flex-1 text-[0.9375rem] leading-7 text-muted-foreground">
            {post.description}
          </p>

          <div className="mt-auto flex items-center justify-between gap-4 border-t border-border pt-4">
            <span className="flex items-center gap-2 text-[0.6875rem] font-medium tracking-[0.1em] text-muted-foreground uppercase">
              <Clock aria-hidden className="h-3 w-3" />
              <span>{post.readingTimeMinutes} min read</span>
            </span>

            <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
              Read article
              <ArrowRight
                aria-hidden
                className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </span>
          </div>
        </div>
      </GlassCard>
    </Link>
  );
};

export default BlogCard;
