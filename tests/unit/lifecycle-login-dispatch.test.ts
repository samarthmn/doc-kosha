import assert from "node:assert/strict";
import test from "node:test";
import { dispatchLifecycleJob } from "@/modules/lifecycle-email/server/dispatch";
import type { LifecycleEmailJobRecord } from "@/modules/lifecycle-email/server/types";
const job: LifecycleEmailJobRecord = {
  id: "10000000-0000-4000-8000-000000000001",
  email_key: "login-session",
  workspace_id: null,
  user_id: "20000000-0000-4000-8000-000000000001",
  queue_message_id: 1,
  scheduled_for: "2026-09-08T12:00:00Z",
  dedupe_key:
    "login-session:20000000-0000-4000-8000-000000000001:30000000-0000-4000-8000-000000000001",
  payload: { sessionId: "30000000-0000-4000-8000-000000000001" },
  status: "processing",
  attempts: 1,
  claimed_at: "2026-09-08T12:00:00Z",
  processed_at: null,
  last_error: null,
  created_at: "2026-09-08T12:00:00Z",
  updated_at: "2026-09-08T12:00:00Z",
};
test("worker dispatches account sign-in before requiring a workspace, preserving deferral", async () => {
  const result = await dispatchLifecycleJob(job, {
    loginSession: async (userId, sessionId) => {
      assert.equal(userId, "20000000-0000-4000-8000-000000000001");
      assert.equal(sessionId, "30000000-0000-4000-8000-000000000001");
      return "deferred";
    },
    workspace: async () => {
      throw new Error("account sign-in must not load workspace");
    },
  });
  assert.equal(result, "deferred");
});
test("worker skips deleted-account jobs and rejects malformed session payloads", async () => {
  const handlers = {
    loginSession: async () => {
      throw new Error("must not send");
    },
    workspace: async () => {
      throw new Error("must not load workspace");
    },
  };
  assert.equal(
    await dispatchLifecycleJob({ ...job, user_id: null }, handlers),
    "skipped",
  );
  await assert.rejects(
    dispatchLifecycleJob({ ...job, payload: { sessionId: "bad" } }, handlers),
  );
});
