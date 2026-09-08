import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  isLifecycleProcessorAuthorizationHeader,
  processLifecycleEmailJobs,
} from "@/modules/lifecycle-email/server";

export const dynamic = "force-dynamic";

const requestSchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
    includeBackfills: z.boolean().optional(),
    includeInactiveSweep: z.boolean().optional(),
  })
  .optional();

const unauthorized = (): NextResponse =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const isAuthorized = (req: NextRequest): boolean =>
  isLifecycleProcessorAuthorizationHeader(req.headers.get("authorization"));

const runProcessor = async (
  args?: z.infer<typeof requestSchema>,
): Promise<NextResponse> => {
  try {
    const result = await processLifecycleEmailJobs(args);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[lifecycle/process] failed", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorized();
  }

  return runProcessor();
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  return runProcessor(parsed.data);
}
