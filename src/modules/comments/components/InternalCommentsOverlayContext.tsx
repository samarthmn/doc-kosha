"use client";

import React, { createContext, useContext } from "react";
import type { CommentAnchor } from "@/hooks/usePublicComments";

export type InternalCommentsHighlightThread = {
  id: string;
  linkId: string;
  pageNumber: number;
  anchor: CommentAnchor;
  state: "open" | "resolved";
};

export type InternalCommentsComposerSelection = {
  linkId: string | null;
  documentId: string;
  pageNumber: number;
  anchor: CommentAnchor;
  selectedText: string;
};

type InternalCommentsOverlayContextValue = {
  highlightThreads: InternalCommentsHighlightThread[];
  setHighlightThreads: (threads: InternalCommentsHighlightThread[]) => void;

  selectedThreadId: string | null;
  setSelectedThreadId: (threadId: string | null) => void;

  composerSelection: InternalCommentsComposerSelection | null;
  setComposerSelection: (
    selection: InternalCommentsComposerSelection | null,
  ) => void;
};

const InternalCommentsOverlayContext =
  createContext<InternalCommentsOverlayContextValue | null>(null);

export const InternalCommentsOverlayProvider: React.FC<
  React.PropsWithChildren<{ value: InternalCommentsOverlayContextValue }>
> = ({ value, children }) => {
  return (
    <InternalCommentsOverlayContext.Provider value={value}>
      {children}
    </InternalCommentsOverlayContext.Provider>
  );
};

export const useInternalCommentsOverlayContext =
  (): InternalCommentsOverlayContextValue => {
    const ctx = useContext(InternalCommentsOverlayContext);
    if (!ctx) {
      throw new Error(
        "useInternalCommentsOverlayContext must be used within InternalCommentsOverlayProvider",
      );
    }
    return ctx;
  };
