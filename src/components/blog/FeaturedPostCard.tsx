import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarBlank,
  Clock,
  User,
} from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import GlassCard from "@/components/marketing/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BlogPost } from "@/modules/blog/server/blogRepository";

interface FeaturedPostCardProps {
  post: BlogPost;
  className?: string;
}

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));

const FeaturedPostCard: React.FC<FeaturedPostCardProps> = ({
  post,
  className,
}) => {
  return (
    <div className={cn("group relative", className)}>
      <GlassCard className="h-full overflow-hidden">
        <div className="grid gap-8 p-6 md:p-10 lg:grid-cols-2 lg:gap-12">
          <div className="flex flex-col justify-center space-y-6">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="pointer-events-none text-[0.6875rem] tracking-[0.1em] uppercase">
                  Featured
                </Badge>
                {post.tags.slice(0, 2).map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[0.6875rem] tracking-[0.1em] uppercase"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>

              <h2 className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">
                <Link
                  href={`/blog/${post.slug}`}
                  className="rounded transition-colors duration-200 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid motion-reduce:transition-none"
                >
                  {post.title}
                </Link>
              </h2>

              <p className="max-w-[58ch] text-base leading-7 text-muted-foreground md:text-[1.0625rem]">
                {post.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.8125rem] font-medium text-muted-foreground">
              <div className="flex items-center gap-2">
                <User aria-hidden className="h-4 w-4" />
                <span>{post.author ?? "DocKosha Editorial"}</span>
              </div>
              <div className="flex items-center gap-2">
                <CalendarBlank aria-hidden className="h-4 w-4" />
                <time dateTime={post.dateISO}>{formatDate(post.dateISO)}</time>
              </div>
              <div className="flex items-center gap-2">
                <Clock aria-hidden className="h-4 w-4" />
                <span>{post.readingTimeMinutes} min read</span>
              </div>
            </div>

            <div className="pt-2">
              <Button asChild size="lg">
                <Link href={`/blog/${post.slug}`}>
                  Read Article
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Right side - Abstract visual or image placeholder */}
          <div className="relative hidden min-h-[300px] overflow-hidden rounded-lg border border-border bg-muted lg:block">
            <img
              src="/assets/blog-placeholder.png"
              alt="Featured blog post visual"
              className="absolute inset-0 h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-[1.02]"
            />
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

export default FeaturedPostCard;
