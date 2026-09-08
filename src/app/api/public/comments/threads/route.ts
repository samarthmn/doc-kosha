import { NextRequest, NextResponse } from "next/server";
import {
  listCommentThreads,
  listCommentThreadsQuerySchema,
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

  console.error("[Public Comments][threads] Unexpected error", error);
  return NextResponse.json(
    {
      error: "Internal server error",
      code: "UNKNOWN",
    },
    { status: 500 },
  );
};

export async function GET(req: NextRequest) {
  const parsed = listCommentThreadsQuerySchema.safeParse({
    linkId: req.nextUrl.searchParams.get("linkId"),
    documentId: req.nextUrl.searchParams.get("documentId"),
  });

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
    const result = await listCommentThreads(req, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
