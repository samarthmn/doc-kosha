"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowSquareOut,
  CaretLeft,
  CaretRight,
  CircleNotch,
  Lifebuoy,
  PlayCircle,
  X,
} from "@phosphor-icons/react";
import { DemoMarkdown } from "@/components/demos/DemoMarkdown";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildDemoWorkflowStepHref,
  type DemoWorkflow,
} from "@/modules/demos/catalog";
import { cn } from "@/lib/utils";

type MarkdownLoadState = {
  status: "idle" | "loading" | "loaded";
  markdown: string | null;
};

interface DemoViewerDialogProps {
  open: boolean;
  workflow: DemoWorkflow | null;
  initialStepIndex: number;
  onOpenChange: (open: boolean) => void;
}

const clampStepIndex = (workflow: DemoWorkflow | null, stepIndex: number) => {
  if (!workflow) {
    return 0;
  }

  if (workflow.steps.length === 0) {
    return 0;
  }

  if (stepIndex < 0) {
    return 0;
  }

  if (stepIndex >= workflow.steps.length) {
    return workflow.steps.length - 1;
  }

  return stepIndex;
};

export const DemoViewerDialog: React.FC<DemoViewerDialogProps> = ({
  open,
  workflow,
  initialStepIndex,
  onOpenChange,
}) => {
  const [stepIndex, setStepIndex] = useState(initialStepIndex);
  const [markdownByStep, setMarkdownByStep] = useState<
    Record<string, MarkdownLoadState>
  >({});
  const markdownByStepRef = useRef(markdownByStep);

  useEffect(() => {
    markdownByStepRef.current = markdownByStep;
  }, [markdownByStep]);

  useEffect(() => {
    setStepIndex(clampStepIndex(workflow, initialStepIndex));
  }, [initialStepIndex, workflow]);

  const currentStep = workflow?.steps[stepIndex];
  const stepKey = workflow ? `${workflow.slug}:${stepIndex}` : null;
  const markdownState = stepKey ? markdownByStep[stepKey] : undefined;
  const hasMultipleSteps = (workflow?.steps.length ?? 0) > 1;
  const stepHref = workflow
    ? buildDemoWorkflowStepHref(workflow.slug, stepIndex + 1)
    : "/demos";

  useEffect(() => {
    if (!open || !workflow || !currentStep || !stepKey) {
      return;
    }

    const existingMarkdownState = markdownByStepRef.current[stepKey];

    if (
      existingMarkdownState?.status === "loading" ||
      existingMarkdownState?.status === "loaded"
    ) {
      return;
    }

    let active = true;

    setMarkdownByStep((current) => ({
      ...current,
      [stepKey]: {
        status: "loading",
        markdown: null,
      },
    }));

    void (async () => {
      try {
        const response = await fetch(
          `/api/demos/markdown?slug=${encodeURIComponent(workflow.slug)}&step=${stepIndex + 1}`,
        );

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as { markdown?: string | null };

        if (!active) {
          return;
        }

        setMarkdownByStep((current) => ({
          ...current,
          [stepKey]: {
            status: "loaded",
            markdown: payload.markdown ?? null,
          },
        }));
      } catch {
        if (!active) {
          return;
        }

        setMarkdownByStep((current) => ({
          ...current,
          [stepKey]: {
            status: "loaded",
            markdown: null,
          },
        }));
      }
    })();

    return () => {
      active = false;
    };
  }, [currentStep, open, stepIndex, stepKey, workflow]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[88vh]">
        {workflow && currentStep ? (
          <>
            <DialogHeader className="border-b border-border px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <p className="text-sm font-medium text-primary">
                    {workflow.title}
                  </p>
                  <DialogTitle className="text-xl leading-tight md:text-2xl">
                    {currentStep.title}
                  </DialogTitle>
                  <DialogDescription className="max-w-3xl">
                    {workflow.description}
                  </DialogDescription>
                </div>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Close demo viewer"
                  >
                    <X aria-hidden className="h-4 w-4" />
                  </Button>
                </DialogClose>
              </div>

              <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={stepIndex === 0}
                    onClick={() => setStepIndex((current) => current - 1)}
                  >
                    <CaretLeft aria-hidden className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={workflow.steps[stepIndex + 1] == null}
                    onClick={() => setStepIndex((current) => current + 1)}
                  >
                    Next
                    <CaretRight aria-hidden className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {hasMultipleSteps ? (
                    <div className="flex flex-wrap gap-2 lg:mr-2">
                      {workflow.steps.map((step, index) => (
                        <Button
                          key={step.id}
                          type="button"
                          size="sm"
                          variant={index === stepIndex ? "default" : "outline"}
                          onClick={() => setStepIndex(index)}
                        >
                          Step {index + 1}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <Button asChild type="button" variant="outline" size="sm">
                    <a
                      href={currentStep.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open MP4
                      <ArrowSquareOut aria-hidden className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button asChild type="button" variant="outline" size="sm">
                    <Link href={stepHref}>
                      Open demo page
                      <ArrowSquareOut aria-hidden className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </DialogHeader>

            <div className="grid min-h-0 flex-1 grid-cols-1 divide-y overflow-y-auto lg:grid-cols-5 lg:divide-x lg:divide-y-0 lg:overflow-hidden">
              <div className="min-h-0 bg-muted/10 p-4 pb-8 lg:col-span-3 lg:overflow-y-auto lg:p-6">
                <div className="mx-auto w-full space-y-4">
                  <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
                    <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-3">
                      <PlayCircle
                        aria-hidden
                        className="h-5 w-5 text-primary"
                      />
                      <span className="text-sm font-medium text-muted-foreground">
                        {currentStep.title}
                      </span>
                    </div>
                    <div className="bg-black/95">
                      <div className="aspect-video w-full">
                        <video
                          key={currentStep.videoUrl}
                          className="h-full w-full"
                          controls
                          playsInline
                          preload="metadata"
                          aria-label={`${workflow.title} - ${currentStep.title}`}
                        >
                          <source src={currentStep.videoUrl} type="video/mp4" />
                          Your browser does not support the video tag.
                        </video>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-h-0 bg-background p-6 pb-8 lg:col-span-2 lg:overflow-y-auto">
                {markdownState?.status === "loading" ? (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 text-sm font-medium text-foreground">
                      <CircleNotch
                        className="h-5 w-5 animate-spin text-primary"
                        aria-hidden
                      />
                      Loading walkthrough notes...
                    </div>
                    <div className="space-y-4">
                      <Skeleton className="h-8 w-1/3" />
                      <Skeleton className="h-5 w-full" />
                      <Skeleton className="h-5 w-[92%]" />
                      <Skeleton className="h-5 w-[86%]" />
                      <Skeleton className="mt-6 h-5 w-full" />
                      <Skeleton className="h-5 w-[90%]" />
                    </div>
                  </div>
                ) : markdownState?.markdown ? (
                  <DemoMarkdown markdown={markdownState.markdown} />
                ) : (
                  <div
                    className={cn(
                      "rounded-2xl border border-border/60 bg-muted/20 px-6 py-8",
                      "mt-4 space-y-4 text-center text-muted-foreground",
                    )}
                  >
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Lifebuoy
                        aria-hidden
                        className="h-6 w-6 text-muted-foreground"
                      />
                    </div>
                    <div>
                      <p className="text-base font-medium text-foreground">
                        Walkthrough notes unavailable
                      </p>
                      <p className="mt-2 text-sm leading-relaxed">
                        The video for this step is still available. You can also
                        open the full demo page for this workflow to see more
                        details.
                      </p>
                    </div>
                    <div className="pt-2">
                      <Button asChild type="button" variant="outline">
                        <Link href={stepHref}>Open demo page</Link>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
