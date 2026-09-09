import { NextRequest, NextResponse } from "next/server";
import { enrichLoginActivity } from "@/modules/auth/server/loginActivity";
import { processLoginSessionFastPath } from "@/modules/lifecycle-email/server";

export async function POST(req: NextRequest) {
  try {
    const identity = await enrichLoginActivity(req.headers);
    if (!identity)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await processLoginSessionFastPath(identity.userId, identity.sessionId);
    return NextResponse.json({ ok: true });
  } catch {
    // The trigger already queued delivery; no tokens, cookies or request data in logs.
    console.error("[login-activity] sign-in context or fast delivery failed");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
