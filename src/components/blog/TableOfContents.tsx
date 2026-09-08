"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  className?: string;
}

const TableOfContents: React.FC<TableOfContentsProps> = ({ className }) => {
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    // Find all h2 and h3 elements within the article content
    const elements = Array.from(
      document.querySelectorAll("article h2, article h3"),
    );

    // Create IDs for headings if they don't exist
    const items: TocItem[] = elements.map((element) => {
      if (!element.id) {
        const slug =
          element.textContent
            ?.toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)+/g, "") || "";
        element.id = slug
          ? /^[a-z]/.test(slug)
            ? slug
            : `section-${slug}`
          : "";
      }

      return {
        id: element.id,
        text: element.textContent || "",
        level: Number(element.tagName.substring(1)),
      };
    });

    setHeadings(items);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "0px 0px -80% 0px" },
    );

    elements.forEach((elem) => observer.observe(elem));

    return () => observer.disconnect();
  }, []);

  if (headings.length === 0) return null;

  return (
    <nav
      className={cn(
        "thin-scrollbar max-h-[calc(100vh-120px)] space-y-4 overflow-y-auto pr-4",
        className,
      )}
    >
      <h4 className="text-[0.6875rem] font-medium tracking-[0.1em] text-muted-foreground uppercase">
        On this page
      </h4>
      <ul className="space-y-2.5 text-sm">
        {headings.map((heading, index) => (
          <li
            key={`${heading.id}-${index}`}
            style={{ paddingLeft: (heading.level - 2) * 16 }}
            className="leading-snug"
          >
            <a
              href={`#${heading.id}`}
              className={cn(
                "block rounded-sm transition-colors duration-200 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid motion-reduce:transition-none",
                activeId === heading.id
                  ? "font-medium text-primary"
                  : "text-muted-foreground",
              )}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(heading.id)?.scrollIntoView({
                  behavior: "smooth",
                });
              }}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default TableOfContents;
