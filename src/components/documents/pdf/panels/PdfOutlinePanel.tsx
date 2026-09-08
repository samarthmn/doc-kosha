"use client";

import React, { useEffect, useState } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { cn } from "@/lib/utils";

type RawOutlineItem = {
  title: string;
  dest: string | unknown[] | null;
  url: string | null;
  items: RawOutlineItem[];
};

type OutlineNode = {
  id: string;
  title: string;
  dest: string | unknown[] | null;
  url: string | null;
  items: OutlineNode[];
};

type PdfOutlinePanelProps = {
  document: PDFDocumentProxy | null;
  onSelectPage: (pageNumber: number) => void;
};

const toOutlineNodes = (
  items: readonly RawOutlineItem[],
  prefix: string,
): OutlineNode[] =>
  items.map((item, index) => {
    const id = `${prefix}${index}`;
    return {
      id,
      title: typeof item.title === "string" ? item.title : "",
      dest: item.dest ?? null,
      url: typeof item.url === "string" ? item.url : null,
      items: Array.isArray(item.items)
        ? toOutlineNodes(item.items, `${id}.`)
        : [],
    };
  });

const isRefLike = (value: unknown): value is { num: number; gen: number } =>
  typeof value === "object" &&
  value !== null &&
  "num" in value &&
  "gen" in value;

const resolveDestinationPage = async (
  pdfDocument: PDFDocumentProxy,
  dest: string | unknown[] | null,
): Promise<number | null> => {
  const resolved =
    typeof dest === "string" ? await pdfDocument.getDestination(dest) : dest;
  if (!Array.isArray(resolved) || resolved.length === 0) return null;

  const target = resolved[0];
  if (typeof target === "number") return target + 1;
  if (isRefLike(target)) {
    const index = await pdfDocument.getPageIndex(target);
    return index + 1;
  }
  return null;
};

type OutlineItemsProps = {
  nodes: readonly OutlineNode[];
  depth: number;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onActivate: (node: OutlineNode) => void;
};

const OutlineItems: React.FC<OutlineItemsProps> = ({
  nodes,
  depth,
  expanded,
  onToggle,
  onActivate,
}) => (
  <ul className="flex flex-col">
    {nodes.map((node) => {
      const hasChildren = node.items.length > 0;
      const isExpanded = expanded.has(node.id);
      return (
        <li key={node.id}>
          <div
            className="flex items-start gap-1"
            style={{ paddingInlineStart: depth * 12 }}
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={() => onToggle(node.id)}
                aria-label={isExpanded ? "Collapse section" : "Expand section"}
                aria-expanded={isExpanded}
                className="mt-1 shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                {isExpanded ? (
                  <CaretDown aria-hidden className="h-3 w-3" />
                ) : (
                  <CaretRight aria-hidden className="h-3 w-3" />
                )}
              </button>
            ) : (
              <span aria-hidden className="mt-1 w-4 shrink-0" />
            )}
            <button
              type="button"
              onClick={() => onActivate(node)}
              className={cn(
                "min-w-0 flex-1 rounded-sm px-1.5 py-1 text-left text-xs text-foreground",
                "hover:bg-[color-mix(in_srgb,var(--primary)_18%,transparent)]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            >
              {node.title || "Untitled"}
            </button>
          </div>
          {hasChildren && isExpanded ? (
            <OutlineItems
              nodes={node.items}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onActivate={onActivate}
            />
          ) : null}
        </li>
      );
    })}
  </ul>
);

export const PdfOutlinePanel: React.FC<PdfOutlinePanelProps> = ({
  document: pdfDocument,
  onSelectPage,
}) => {
  const [nodes, setNodes] = useState<readonly OutlineNode[] | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setNodes(null);
    setExpanded(new Set());
    if (!pdfDocument) return;

    let active = true;
    void pdfDocument
      .getOutline()
      .then((outline) => {
        if (!active) return;
        setNodes(
          Array.isArray(outline)
            ? toOutlineNodes(outline as unknown as RawOutlineItem[], "")
            : [],
        );
      })
      .catch(() => {
        if (active) setNodes([]);
      });
    return () => {
      active = false;
    };
  }, [pdfDocument]);

  const handleActivate = (node: OutlineNode): void => {
    if (node.url) {
      window.open(node.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!pdfDocument) return;
    void resolveDestinationPage(pdfDocument, node.dest)
      .then((pageNumber) => {
        if (pageNumber !== null) onSelectPage(pageNumber);
      })
      .catch(() => {
        // A malformed destination is not worth interrupting the viewer for.
      });
  };

  if (nodes === null) {
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">
        Loading outline…
      </p>
    );
  }
  if (nodes.length === 0) {
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">
        There is no bookmark
      </p>
    );
  }

  return (
    <OutlineItems
      nodes={nodes}
      depth={0}
      expanded={expanded}
      onToggle={(id) =>
        setExpanded((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })
      }
      onActivate={handleActivate}
    />
  );
};
