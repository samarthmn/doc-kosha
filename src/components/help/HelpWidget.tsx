"use client";

import React, { useDeferredValue, useState } from "react";
import { Lifebuoy, PlayCircle, MagnifyingGlass } from "@phosphor-icons/react";
import { DemoViewerDialog } from "@/components/help/DemoViewerDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  getAllDemoWorkflows,
  getAllDemoWorkflowSteps,
  getDemoWorkflowBySlug,
  type DemoWorkflowStepMatch,
} from "@/modules/demos/catalog";
import { cn } from "@/lib/utils";

type SelectedDemo = {
  slug: string;
  stepIndex: number;
} | null;

const matchesQuery = (
  entry: DemoWorkflowStepMatch,
  normalizedQuery: string,
): boolean => {
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    entry.workflow.title,
    entry.workflow.description,
    entry.step.title,
  ].join(" ");

  return haystack.toLowerCase().includes(normalizedQuery);
};

export const HelpWidget: React.FC = () => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedDemo, setSelectedDemo] = useState<SelectedDemo>(null);
  const deferredQuery = useDeferredValue(query);

  const workflows = getAllDemoWorkflows();
  const allSteps = getAllDemoWorkflowSteps();
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const matchingSteps = normalizedQuery
    ? allSteps.filter((entry) => matchesQuery(entry, normalizedQuery))
    : [];
  const selectedWorkflow = selectedDemo
    ? (getDemoWorkflowBySlug(selectedDemo.slug) ?? null)
    : null;

  return (
    <>
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        {!isSheetOpen ? (
          <Button
            type="button"
            onClick={() => setIsSheetOpen(true)}
            className={cn(
              "dk-mobile-floating-chrome fixed right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 h-10 rounded-md border border-primary bg-[var(--dk-surface-overlay)] px-3 text-primary shadow-[var(--dk-shadow-card)] transition-colors hover:bg-primary/10 hover:text-primary",
              "lg:right-6 lg:bottom-6",
            )}
            aria-label="Open help and demo library"
          >
            <Lifebuoy className="mr-2 h-4 w-4" aria-hidden />
            <span className="text-[13px] font-medium">Help & Demo</span>
          </Button>
        ) : null}

        <SheetContent
          side="right"
          showCloseButton
          className="border-l border-border bg-[var(--dk-surface-overlay)] md:max-w-xl"
        >
          <SheetHeader className="space-y-2">
            <SheetTitle className="flex items-center gap-2 text-xl font-medium tracking-[-0.015em]">
              <Lifebuoy className="h-5 w-5 text-primary" aria-hidden />
              Help
            </SheetTitle>
            <SheetDescription>
              Search demo videos and walkthrough notes for the workflows already
              available in DocKosha.
            </SheetDescription>
          </SheetHeader>

          <div className="relative mt-6">
            <MagnifyingGlass
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
              placeholder="Search guide name or description"
              aria-label="Search demo guides"
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-xs">
            <p className="text-muted-foreground">
              {normalizedQuery
                ? `${matchingSteps.length} matching demo${matchingSteps.length === 1 ? "" : "s"}`
                : `${workflows.length} demo workflows`}
            </p>
            {query ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setQuery("")}
              >
                Clear
              </Button>
            ) : null}
          </div>

          <div className="mt-4 space-y-4 overflow-y-auto pb-20">
            {normalizedQuery ? (
              matchingSteps.length > 0 ? (
                <div className="space-y-3">
                  {matchingSteps.map((entry) => (
                    <button
                      key={`${entry.workflow.slug}:${entry.step.id}`}
                      type="button"
                      className={cn(
                        "group flex w-full flex-col justify-between gap-3 rounded-lg border border-border bg-card p-4 text-left shadow-[var(--dk-shadow-card)] transition-colors hover:border-primary/40 hover:bg-primary/[0.03]",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                      )}
                      onClick={() =>
                        setSelectedDemo({
                          slug: entry.workflow.slug,
                          stepIndex: entry.stepIndex,
                        })
                      }
                    >
                      <div className="w-full space-y-1">
                        <p className="mb-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
                          {entry.workflow.title}
                        </p>
                        <p className="text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                          {entry.step.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                          {entry.workflow.description}
                        </p>
                      </div>
                      <div className="mt-2 flex w-full items-center justify-between border-t border-border/30 pt-3">
                        <span className="text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                          Watch demo
                        </span>
                        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/20 bg-primary/8 text-primary transition-colors group-hover:bg-primary/15">
                          <PlayCircle className="h-4 w-4" aria-hidden />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-6">
                    <EmptyState
                      variant="bare"
                      compact
                      icon={
                        <MagnifyingGlass
                          className="h-6 w-6 text-muted-foreground"
                          aria-hidden
                        />
                      }
                      title="No demos found"
                      description="Try a different keyword or clear the search to browse all available demo workflows."
                    />
                  </CardContent>
                </Card>
              )
            ) : (
              <div className="space-y-8">
                {workflows.map((workflow) => (
                  <div key={workflow.slug} className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold tracking-tight text-foreground">
                        {workflow.title}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {workflow.description}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {workflow.steps.map((step, stepIndex) => (
                        <button
                          key={step.id}
                          type="button"
                          className={cn(
                            "group flex w-full items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 text-left shadow-[var(--dk-shadow-card)] transition-colors hover:border-primary/40 hover:bg-primary/[0.03]",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                          )}
                          onClick={() =>
                            setSelectedDemo({
                              slug: workflow.slug,
                              stepIndex,
                            })
                          }
                        >
                          <div className="flex min-w-0 flex-col">
                            <span className="text-base font-medium text-foreground transition-colors group-hover:text-primary">
                              {step.title}
                            </span>
                            <span className="mt-1 text-sm text-muted-foreground">
                              Step {stepIndex + 1}
                            </span>
                          </div>
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/8 text-primary transition-colors group-hover:bg-primary/15">
                            <PlayCircle className="h-4 w-4" aria-hidden />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <DemoViewerDialog
        open={selectedDemo != null}
        workflow={selectedWorkflow}
        initialStepIndex={selectedDemo?.stepIndex ?? 0}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDemo(null);
          }
        }}
      />
    </>
  );
};
