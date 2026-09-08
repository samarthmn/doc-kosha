import { NextRequest, NextResponse } from "next/server";
import {
  resolveCommentBodySchema,
  updateCommentThreadState,
  CommentsApiError,
} from "@/modules/comments";

const toErrorResponse = (error: unknown): NextResponse => {
  if (error instanceof CommentsApiError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.status },
    );
  }

  console.error("[Public Comments][resolve] Unexpected error", error);
  return NextResponse.json(
    {
      error: "Internal server error",
      code: "UNKNOWN",
    },
    { status: 500 },
  );
};

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  const parsed = resolveCommentBodySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request",
        code: "INVALID_INPUT",
      },
      { status: 400 },
    );
  }

  try {
    const result = await updateCommentThreadState(req, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
