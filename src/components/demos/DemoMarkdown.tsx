"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const markdownComponents: Components = {
  h1: ({ node, ...props }) => (
    <h2
      {...props}
      className={cn(
        "mt-8 mb-3 text-2xl font-semibold text-foreground",
        props.className,
      )}
    />
  ),
  h2: ({ node, ...props }) => (
    <h3
      {...props}
      className={cn(
        "mt-7 mb-3 text-xl font-semibold text-foreground",
        props.className,
      )}
    />
  ),
  h3: ({ node, ...props }) => (
    <h4
      {...props}
      className={cn(
        "mt-6 mb-2 text-lg font-semibold text-foreground",
        props.className,
      )}
    />
  ),
  p: ({ node, ...props }) => (
    <p
      {...props}
      className={cn(
        "mt-3 leading-relaxed text-muted-foreground",
        props.className,
      )}
    />
  ),
  ul: ({ node, ...props }) => (
    <ul
      {...props}
      className={cn(
        "mt-3 list-disc space-y-2 pl-6 text-muted-foreground",
        props.className,
      )}
    />
  ),
  ol: ({ node, ...props }) => (
    <ol
      {...props}
      className={cn(
        "mt-3 list-decimal space-y-2 pl-6 text-muted-foreground",
        props.className,
      )}
    />
  ),
  li: ({ node, ...props }) => (
    <li {...props} className={cn("marker:text-primary", props.className)} />
  ),
  strong: ({ node, ...props }) => (
    <strong {...props} className={cn("text-foreground", props.className)} />
  ),
  a: ({ node, ...props }) => (
    <a
      {...props}
      className={cn(
        "text-primary underline-offset-4 hover:underline",
        props.className,
      )}
      target="_blank"
      rel="noreferrer"
    />
  ),
  hr: ({ node, ...props }) => (
    <hr {...props} className={cn("my-6 border-border", props.className)} />
  ),
};

interface DemoMarkdownProps {
  markdown: string;
  className?: string;
}

export const DemoMarkdown: React.FC<DemoMarkdownProps> = ({
  markdown,
  className,
}) => {
  return (
    <article className={cn("max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
};
