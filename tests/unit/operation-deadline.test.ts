import assert from "node:assert/strict";
import test from "node:test";

import {
  createOperationDeadline,
  remainingOperationTimeMs,
  runWithinOperationDeadline,
} from "@/server/operationDeadline";

test("one absolute deadline yields decreasing remaining stage budgets", () => {
  const deadline = createOperationDeadline(1_000, 10_000);

  assert.equal(deadline.deadlineAt, 11_000);
  assert.equal(remainingOperationTimeMs(deadline, 10_250), 750);
  assert.equal(remainingOperationTimeMs(deadline, 11_250), 0);
});

test("deadline exhaustion rejects with the typed deadline_exceeded envelope", async () => {
  const deadline = createOperationDeadline(5);

  await assert.rejects(
    runWithinOperationDeadline(deadline, {
      operation: "conversion",
      format: "docx",
      run: async () => new Promise<never>(() => undefined),
    }),
    (error: unknown) => {
      assert.equal(typeof error, "object");
      assert.ok(error);
      assert.equal(Reflect.get(error, "code"), "deadline_exceeded");
      assert.equal(Reflect.get(error, "operation"), "conversion");
      assert.equal(Reflect.get(error, "format"), "docx");
      return true;
    },
  );
});
