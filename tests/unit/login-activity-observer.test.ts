import assert from "node:assert/strict";
import test from "node:test";
import { createLoginActivityObserver } from "@/lib/loginActivityObserver";
const token = (id: string) =>
  `header.${btoa(JSON.stringify({ session_id: id }))}.signature`;
const first = token("10000000-0000-4000-8000-000000000001");
const second = token("10000000-0000-4000-8000-000000000002");
test("initial and repeated SIGNED_IN callbacks share one request; a later same-device session sends", async () => {
  const sent: string[] = [];
  const observe = createLoginActivityObserver(async (accessToken) => {
    sent.push(accessToken);
  });
  await Promise.all([
    observe("INITIAL_SESSION", first),
    observe("SIGNED_IN", first),
    observe("SIGNED_IN", first),
  ]);
  await observe("TOKEN_REFRESHED", second);
  await observe("SIGNED_IN", second);
  assert.deepEqual(sent, [first, second]);
});
test("failed context request can retry while successful sessions stay deduplicated", async () => {
  let attempts = 0;
  const observe = createLoginActivityObserver(async () => {
    if (++attempts === 1) throw new Error("offline");
  });
  await assert.rejects(observe("SIGNED_IN", first), /offline/);
  await observe("SIGNED_IN", first);
  await observe("SIGNED_IN", first);
  assert.equal(attempts, 2);
});
test("malformed token never sends context", async () => {
  let count = 0;
  const observe = createLoginActivityObserver(async () => {
    count++;
  });
  await observe("SIGNED_IN", "invalid");
  await observe("INITIAL_SESSION", null);
  assert.equal(count, 0);
});
