import { NextResponse } from "next/server";
import { z } from "zod";
import { getDemoWorkflowStep } from "@/modules/demos/catalog";
import { fetchDemoStepMarkdown } from "@/modules/demos/server/fetchDemoStepMarkdown";

const querySchema = z.object({
  slug: z.string().trim().min(1),
  step: z.coerce.number().int().min(1),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    slug: url.searchParams.get("slug"),
    step: url.searchParams.get("step"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const demoStep = getDemoWorkflowStep(parsed.data.slug, parsed.data.step);

  if (!demoStep) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const markdown = await fetchDemoStepMarkdown(demoStep.step.markdownUrl);

    return NextResponse.json({ markdown }, { status: 200 });
  } catch (error) {
    console.error("[api/demos/markdown] failed to load markdown", error);
    return NextResponse.json(
      { error: "Failed to load markdown" },
      { status: 502 },
    );
  }
}
