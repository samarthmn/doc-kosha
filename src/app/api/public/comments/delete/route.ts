import { NextRequest, NextResponse } from "next/server";
import {
  CommentsApiError,
  deleteCommentMessage,
} from "@/modules/comments/server/service";
import { deleteCommentMessageBodySchema } from "@/modules/comments/server/schemas";

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

  console.error("[Public Comments][delete] Unexpected error", error);
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
  const parsed = deleteCommentMessageBodySchema.safeParse(payload);

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
    const result = await deleteCommentMessage(req, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
