"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { CaretLeft, CaretRight, MagnifyingGlass } from "@phosphor-icons/react";
import type {
  PdfFindRequest,
  PdfFindResult,
} from "@/components/documents/pdf/engine/pdfViewerCore";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type PdfSearchPopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: PdfFindResult | null;
  onFind: (request: PdfFindRequest) => void;
  onDismiss: () => void;
  onResetResult: () => void;
};

export const PdfSearchPopover: React.FC<PdfSearchPopoverProps> = ({
  open,
  onOpenChange,
  result,
  onFind,
  onDismiss,
  onResetResult,
}) => {
  const [keyword, setKeyword] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWords, setWholeWords] = useState(false);
  const matchCaseId = useId();
  const wholeWordsId = useId();
  const keywordRef = useRef(keyword);
  keywordRef.current = keyword;
  // Every find dispatch feeds a match-count event back into `result`, which
  // re-renders this component. Reading the callbacks through refs keeps
  // `runFind` out of that cycle — an inline `onFind` prop would otherwise make
  // the option effect re-fire on every result and loop forever.
  const onFindRef = useRef(onFind);
  onFindRef.current = onFind;
  const onResetResultRef = useRef(onResetResult);
  onResetResultRef.current = onResetResult;

  const runFind = useCallback(
    (options: { again: boolean; findPrevious: boolean }) => {
      const query = keywordRef.current;
      if (!query) {
        onResetResultRef.current();
        return;
      }
      onFindRef.current({
        query,
        caseSensitive: matchCase,
        entireWord: wholeWords,
        findPrevious: options.findPrevious,
        again: options.again,
      } satisfies PdfFindRequest);
    },
    [matchCase, wholeWords],
  );

  // Option changes re-match the whole document, mirroring the retired plugin,
  // where toggling a checkbox immediately refreshed the counter.
  useEffect(() => {
    if (!open) return;
    if (!keywordRef.current) return;
    runFind({ again: false, findPrevious: false });
    // `runFind` already closes over the current options.
  }, [open, runFind]);

  const handleOpenChange = (next: boolean): void => {
    onOpenChange(next);
    if (!next) {
      onDismiss();
      onResetResult();
    }
  };

  const total = result?.matches.total ?? 0;
  const current = result?.matches.current ?? 0;
  const notFound = Boolean(keyword) && result?.status === "not-found";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Search"
        >
          <MagnifyingGlass aria-hidden className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="relative flex items-center">
          <input
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              keywordRef.current = event.target.value;
              if (!event.target.value) {
                onDismiss();
                onResetResult();
                return;
              }
              runFind({ again: false, findPrevious: false });
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              runFind({ again: true, findPrevious: event.shiftKey });
            }}
            placeholder="Enter to search"
            aria-label="Search document"
            className="h-8 w-full rounded border border-input bg-card px-2 pr-14 text-xs outline-none focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
          {keyword ? (
            <span
              className="absolute right-2 text-[11px] text-muted-foreground tabular-nums"
              aria-live="polite"
            >
              {current}/{total}
            </span>
          ) : null}
        </div>

        {notFound ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            No results found
          </p>
        ) : null}

        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id={matchCaseId}
              checked={matchCase}
              onCheckedChange={(checked) => setMatchCase(checked === true)}
            />
            <Label htmlFor={matchCaseId} className="text-xs font-normal">
              Match case
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={wholeWordsId}
              checked={wholeWords}
              onCheckedChange={(checked) => setWholeWords(checked === true)}
            />
            <Label htmlFor={wholeWordsId} className="text-xs font-normal">
              Whole words
            </Label>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Previous match"
            disabled={total === 0}
            onClick={() => runFind({ again: true, findPrevious: true })}
          >
            <CaretLeft aria-hidden className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Next match"
            disabled={total === 0}
            onClick={() => runFind({ again: true, findPrevious: false })}
          >
            <CaretRight aria-hidden className="h-3.5 w-3.5" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
