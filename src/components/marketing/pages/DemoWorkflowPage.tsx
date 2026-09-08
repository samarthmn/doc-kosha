import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoMarkdown } from "@/components/demos/DemoMarkdown";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";
import GlassCard from "@/components/marketing/GlassCard";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getDemoWorkflowBySlug,
  getDemoWorkflowNeighbors,
} from "@/modules/demos/catalog";
import { fetchDemoStepMarkdown } from "@/modules/demos/server/fetchDemoStepMarkdown";

interface DemoWorkflowPageProps {
  slug: string;
  rawStep: string | string[] | undefined;
}

const parseStepIndex = (
  rawStep: string | string[] | undefined,
  totalSteps: number,
): number => {
  const candidate = Array.isArray(rawStep) ? rawStep[0] : rawStep;
  const parsed = Number.parseInt(candidate ?? "1", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 0;
  }

  if (parsed > totalSteps) {
    return totalSteps - 1;
  }

  return parsed - 1;
};

const DemoWorkflowPage: React.FC<DemoWorkflowPageProps> = async ({
  slug,
  rawStep,
}) => {
  const workflow = getDemoWorkflowBySlug(slug);

  if (!workflow) {
    return notFound();
  }

  const stepIndex = parseStepIndex(rawStep, workflow.steps.length);
  const currentStep = workflow.steps[stepIndex];
  const markdown = await fetchDemoStepMarkdown(currentStep.markdownUrl);
  const currentStepNumber = stepIndex + 1;
  const hasMultipleSteps = workflow.steps.length > 1;
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === workflow.steps.length - 1;
  const previousStepHref =
    currentStepNumber - 1 <= 1
      ? `/demos/${workflow.slug}`
      : `/demos/${workflow.slug}?step=${currentStepNumber - 1}`;
  const nextStepHref = `/demos/${workflow.slug}?step=${currentStepNumber + 1}`;
  const { previous, next } = getDemoWorkflowNeighbors(workflow.slug);

  return (
    <MarketingShell>
      <MarketingHero
        badge="Product Demo"
        title={workflow.title}
        subtitle={workflow.description}
      >
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg" className="h-12 px-8 text-base">
            <Link href="/demos">All demos</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 bg-background/50 px-8 text-base backdrop-blur-sm"
          >
            <Link href="/features">Back to features</Link>
          </Button>
        </div>
      </MarketingHero>

      <MarketingSection className="pt-0">
        <MarketingContainer size="lg" className="space-y-6">
          <GlassCard className="overflow-hidden">
            <CardHeader>
              <CardTitle>{currentStep.title}</CardTitle>
              <CardDescription>
                {hasMultipleSteps
                  ? `Demo segment ${currentStep.id}. Use next/previous to move across this workflow.`
                  : `Complete workflow walkthrough for demo ${workflow.id}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-border bg-background/50 [box-shadow:var(--dk-shadow-card)]">
                <div className="flex items-center border-b border-border bg-muted/20 px-4 py-2.5">
                  <span className="text-xs text-muted-foreground">
                    {workflow.title}
                  </span>
                </div>
                <div className="bg-black/90">
                  <div className="aspect-video w-full">
                    <video
                      className="h-full w-full"
                      controls
                      playsInline
                      preload="metadata"
                      aria-label={`${workflow.title} - ${currentStep.title}`}
                    >
                      <source src={currentStep.videoUrl} type="video/mp4" />
                      Your browser does not support the video tag.{" "}
                      <a
                        href={currentStep.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open the demo video.
                      </a>
                    </video>
                  </div>
                </div>
              </div>

              {hasMultipleSteps ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {workflow.steps.map((step, index) => {
                      const href =
                        index === 0
                          ? `/demos/${workflow.slug}`
                          : `/demos/${workflow.slug}?step=${index + 1}`;

                      return (
                        <Button
                          key={step.id}
                          asChild
                          size="sm"
                          variant={index === stepIndex ? "default" : "outline"}
                        >
                          <Link href={href}>Step {index + 1}</Link>
                        </Button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {isFirstStep ? (
                      <Button variant="outline" disabled>
                        Previous Step
                      </Button>
                    ) : (
                      <Button asChild variant="outline">
                        <Link href={previousStepHref}>Previous Step</Link>
                      </Button>
                    )}
                    {isLastStep ? (
                      <Button variant="outline" disabled>
                        Next Step
                      </Button>
                    ) : (
                      <Button asChild variant="outline">
                        <Link href={nextStepHref}>Next Step</Link>
                      </Button>
                    )}
                    <Button asChild variant="outline">
                      <a
                        href={currentStep.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open MP4
                      </a>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Button asChild variant="outline">
                    <a
                      href={currentStep.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open MP4
                    </a>
                  </Button>
                </div>
              )}
            </CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader>
              <CardTitle>
                {hasMultipleSteps
                  ? "Step Walkthrough Notes"
                  : "Walkthrough Notes"}
              </CardTitle>
              <CardDescription>
                {hasMultipleSteps
                  ? "Notes loaded from the matching markdown file for this step."
                  : "Notes loaded from the matching markdown file for this demo."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {markdown ? (
                <DemoMarkdown markdown={markdown} />
              ) : (
                <p className="text-muted-foreground">
                  The step notes are temporarily unavailable. You can still
                  watch the video above.
                </p>
              )}
            </CardContent>
          </GlassCard>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection variant="muted" className="pt-8 pb-24">
        <MarketingContainer size="lg">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-semibold md:text-3xl">
                Continue exploring
              </h2>
              <p className="mt-2 text-muted-foreground">
                Move to the next demo workflow or go back to the full list.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {previous ? (
                <Button asChild variant="outline">
                  <Link href={`/demos/${previous.slug}`}>Previous demo</Link>
                </Button>
              ) : null}
              {next ? (
                <Button asChild>
                  <Link href={`/demos/${next.slug}`}>Next demo</Link>
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <Link href="/demos">All demos</Link>
              </Button>
            </div>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default DemoWorkflowPage;
