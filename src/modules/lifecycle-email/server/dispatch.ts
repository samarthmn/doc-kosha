import { z } from "zod";
import type { LifecycleEmailJobRecord } from "./types";
type Result = "sent" | "skipped" | "deferred";
export async function dispatchLifecycleJob(
  job: LifecycleEmailJobRecord,
  handlers: {
    loginSession: (userId: string, sessionId: string) => Promise<Result>;
    workspace: (job: LifecycleEmailJobRecord) => Promise<Result>;
  },
): Promise<Result> {
  if (job.email_key === "login-session") {
    if (!job.user_id) return "skipped";
    const payload = z
      .object({ sessionId: z.string().uuid() })
      .parse(job.payload);
    return handlers.loginSession(job.user_id, payload.sessionId);
  }
  return handlers.workspace(job);
}
