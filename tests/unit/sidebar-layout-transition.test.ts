import assert from "node:assert/strict";
import test from "node:test";

import {
  createSidebarAwareResizeCommitter,
  createSidebarLayoutTransitionCoordinator,
} from "@/components/layouts/sidebarLayoutTransition";

const createFrameHarness = () => {
  let nextFrameId = 1;
  const frames = new Map<number, FrameRequestCallback>();

  return {
    cancelFrame: (frameId: number): void => {
      frames.delete(frameId);
    },
    flushNext: (): void => {
      const next = frames.entries().next();
      assert.equal(next.done, false, "expected a queued animation frame");
      const [frameId, callback] = next.value;
      frames.delete(frameId);
      callback(0);
    },
    get queuedFrames(): number {
      return frames.size;
    },
    requestFrame: (callback: FrameRequestCallback): number => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      frames.set(frameId, callback);
      return frameId;
    },
  };
};

test("a rapid rail reversal stays active and stale completion cannot settle the newer motion", () => {
  const coordinator = createSidebarLayoutTransitionCoordinator();
  const events: string[] = [];
  coordinator.subscribe((event) => events.push(event));

  const collapse = coordinator.begin(68);
  const expand = coordinator.begin(232);

  assert.equal(coordinator.isActive(), true);
  assert.deepEqual(events, ["active"]);
  assert.equal(coordinator.complete(collapse, 68), false);
  assert.equal(coordinator.cancel(collapse), false);
  assert.equal(coordinator.complete(expand, 68), false);
  assert.equal(coordinator.isActive(), true);
  assert.deepEqual(events, ["active"]);

  assert.equal(coordinator.complete(expand, 232), true);
  assert.equal(coordinator.isActive(), false);
  assert.deepEqual(events, ["active", "settled"]);
});

test("only the current rail session can cancel and disposal silences future notifications", () => {
  const coordinator = createSidebarLayoutTransitionCoordinator();
  const events: string[] = [];
  coordinator.subscribe((event) => events.push(event));

  const first = coordinator.begin(68);
  const second = coordinator.begin(232);
  assert.equal(coordinator.cancel(first), false);
  assert.equal(coordinator.cancel(second), true);
  assert.deepEqual(events, ["active", "settled"]);

  const third = coordinator.begin(68);
  coordinator.dispose();
  assert.equal(coordinator.isActive(), false);
  assert.equal(coordinator.complete(third, 68), false);
  assert.deepEqual(events, ["active", "settled", "active", "disposed"]);

  const afterDispose: string[] = [];
  coordinator.subscribe((event) => afterDispose.push(event));
  coordinator.begin(232);
  assert.equal(afterDispose.length, 0);

  coordinator.activate();
  coordinator.subscribe((event) => afterDispose.push(event));
  const strictModeReplay = coordinator.begin(68);
  assert.deepEqual(afterDispose, ["active"]);
  assert.equal(coordinator.cancel(strictModeReplay), true);
  assert.deepEqual(afterDispose, ["active", "settled"]);
});

test("resize work coalesces normally, pauses through a rail reversal, and flushes once after settle", () => {
  const coordinator = createSidebarLayoutTransitionCoordinator();
  const frames = createFrameHarness();
  let commits = 0;
  const committer = createSidebarAwareResizeCommitter({
    coordinator,
    onCommit: () => {
      commits += 1;
    },
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
  });

  committer.requestCommit();
  committer.requestCommit();
  assert.equal(frames.queuedFrames, 1);
  frames.flushNext();
  assert.equal(commits, 1);

  committer.requestCommit();
  assert.equal(frames.queuedFrames, 1);
  const collapse = coordinator.begin(68);
  assert.equal(frames.queuedFrames, 0);
  committer.requestCommit();
  committer.requestCommit();
  assert.equal(frames.queuedFrames, 0);

  const expand = coordinator.begin(232);
  assert.equal(coordinator.complete(collapse, 68), false);
  assert.equal(frames.queuedFrames, 0);
  assert.equal(coordinator.complete(expand, 232), true);
  assert.equal(frames.queuedFrames, 1);

  committer.requestCommit();
  assert.equal(frames.queuedFrames, 1);
  frames.flushNext();
  assert.equal(commits, 2);
  assert.equal(frames.queuedFrames, 0);

  const cleanTransition = coordinator.begin(68);
  assert.equal(coordinator.complete(cleanTransition, 68), true);
  assert.equal(frames.queuedFrames, 0);
});

test("a viewer mounted mid-motion waits for settle and cleanup cancels every queued callback", () => {
  const coordinator = createSidebarLayoutTransitionCoordinator();
  const frames = createFrameHarness();
  const transition = coordinator.begin(68);
  let commits = 0;
  const committer = createSidebarAwareResizeCommitter({
    coordinator,
    onCommit: () => {
      commits += 1;
    },
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
  });

  committer.requestCommit();
  assert.equal(frames.queuedFrames, 0);
  assert.equal(coordinator.complete(transition, 68), true);
  assert.equal(frames.queuedFrames, 1);

  committer.dispose();
  assert.equal(frames.queuedFrames, 0);
  committer.requestCommit();
  assert.equal(frames.queuedFrames, 0);
  assert.equal(commits, 0);

  const later = coordinator.begin(232);
  coordinator.complete(later, 232);
  assert.equal(frames.queuedFrames, 0);
});

test("provider disposal cancels dirty viewer work without publishing a settle flush", () => {
  const coordinator = createSidebarLayoutTransitionCoordinator();
  const frames = createFrameHarness();
  let commits = 0;
  const committer = createSidebarAwareResizeCommitter({
    coordinator,
    onCommit: () => {
      commits += 1;
    },
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
  });

  coordinator.begin(68);
  committer.requestCommit();
  assert.equal(frames.queuedFrames, 0);
  coordinator.dispose();
  assert.equal(frames.queuedFrames, 0);

  committer.requestCommit();
  assert.equal(frames.queuedFrames, 0);
  assert.equal(commits, 0);
  committer.dispose();
});
