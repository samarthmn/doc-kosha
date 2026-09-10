import assert from "node:assert/strict";
import test from "node:test";
import {
  deliverLoginSession,
  type LoginSessionDeliveryDependencies,
} from "@/modules/lifecycle-email/server/loginSessionDelivery";

const event = {
  userId: "user-1",
  sessionId: "session-1",
  occurredAt: "2026-09-08T12:00:00Z",
  eligible: true,
  disabledAt: null,
  deviceLabel: null,
  countryCode: null,
};
function fixture() {
  const messages: unknown[] = [];
  let disabled = false;
  const deps: LoginSessionDeliveryDependencies = {
    loadEvent: async () => ({
      ...event,
      disabledAt: disabled ? "2026-09-08T12:01:00Z" : null,
    }),
    loadRecipient: async () => ({
      email: "person@example.test",
      enabled: true,
    }),
    disable: async () => {
      disabled = true;
    },
    claim: async () => ({ claimed: true, id: "delivery", token: "lease" }),
    send: async (args) => {
      messages.push(args);
      return true;
    },
    settingsUrl: "https://example.test/settings",
  };
  return { deps, messages };
}
test("worker sends a captured sign-in without browser context or an active session", async () => {
  const { deps, messages } = fixture();
  assert.equal(await deliverLoginSession("user-1", "session-1", deps), "sent");
  assert.equal(messages.length, 1);
  assert.match((messages[0] as { text: string }).text, /Device: Unknown/);
});
test("initial session and deleted account never deliver", async () => {
  const { deps, messages } = fixture();
  deps.loadEvent = async () => ({ ...event, eligible: false });
  assert.equal(
    await deliverLoginSession("user-1", "session-1", deps),
    "skipped",
  );
  deps.loadEvent = async () => null;
  assert.equal(
    await deliverLoginSession("user-1", "session-1", deps),
    "skipped",
  );
  assert.equal(messages.length, 0);
});
test("disabled preference becomes terminal even if re-enabled before queue retry", async () => {
  const { deps, messages } = fixture();
  deps.loadRecipient = async () => ({
    email: "person@example.test",
    enabled: false,
  });
  assert.equal(
    await deliverLoginSession("user-1", "session-1", deps),
    "skipped",
  );
  deps.loadRecipient = async () => ({
    email: "person@example.test",
    enabled: true,
  });
  assert.equal(
    await deliverLoginSession("user-1", "session-1", deps),
    "skipped",
  );
  assert.equal(messages.length, 0);
});
test("an in-progress delivery defers and a sent delivery stays terminal", async () => {
  const { deps, messages } = fixture();
  deps.claim = async () => ({ claimed: false, reason: "in_progress" });
  assert.equal(
    await deliverLoginSession("user-1", "session-1", deps),
    "deferred",
  );
  deps.claim = async () => ({ claimed: false, reason: "sent" });
  assert.equal(await deliverLoginSession("user-1", "session-1", deps), "sent");
  assert.equal(messages.length, 0);
});
test("failed send remains retryable instead of skipped", async () => {
  const { deps } = fixture();
  deps.send = async () => false;
  await assert.rejects(
    deliverLoginSession("user-1", "session-1", deps),
    /delivery failed/,
  );
});

test("endpoint and worker contend for one durable claim and retry without duplicate mail", async () => {
  const { deps, messages } = fixture();
  let state: "unclaimed" | "claimed" | "sent" = "unclaimed";
  let releaseSend!: () => void;
  const sending = new Promise<void>((resolve) => {
    releaseSend = resolve;
  });
  deps.claim = async (args) => {
    assert.equal(args.dedupeKey, "login-session:user-1:session-1");
    if (state === "claimed") return { claimed: false, reason: "in_progress" };
    if (state === "sent") return { claimed: false, reason: "sent" };
    state = "claimed";
    return { claimed: true, id: "delivery", token: "lease" };
  };
  deps.send = async (args) => {
    await sending;
    messages.push(args);
    state = "sent";
    return true;
  };
  const endpoint = deliverLoginSession("user-1", "session-1", deps);
  const worker = deliverLoginSession("user-1", "session-1", deps);
  assert.equal(await worker, "deferred");
  releaseSend();
  assert.equal(await endpoint, "sent");
  assert.equal(await deliverLoginSession("user-1", "session-1", deps), "sent");
  assert.equal(messages.length, 1);
});

test("deleted or email-less recipient is skipped before claiming a delivery", async () => {
  const { deps, messages } = fixture();
  deps.loadRecipient = async () => null;
  deps.claim = async () => {
    throw new Error("must not claim deleted account");
  };
  assert.equal(
    await deliverLoginSession("user-1", "session-1", deps),
    "skipped",
  );
  assert.equal(messages.length, 0);
});
