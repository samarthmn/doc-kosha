import assert from "node:assert/strict";
import test from "node:test";
import type { LinkAlcRules } from "@/lib/linkAlcClient";
import {
  applyAlcRulesReview,
  consumeAlcReviewRequest,
  createAlcDialogFlowState,
  createAlcRulesDraft,
  getAlcReviewMetadataState,
  prepareAlcRulesApply,
  transitionAlcDialogFlow,
  type AlcOverlapResolutionMap,
} from "@/modules/public-links";

const rulesWithOverlaps: LinkAlcRules = {
  room: {
    allowedEmails: ["viewer@example.com"],
    allowedGroupIds: ["group-finance"],
  },
  folders: [
    {
      folderId: "folder-financials",
      allowedEmails: ["viewer@example.com", "folder-only@example.com"],
      allowedGroupIds: [],
    },
  ],
  documents: [
    {
      documentId: "document-plan",
      allowedEmails: [],
      allowedGroupIds: ["group-finance"],
    },
  ],
};

test("ALC draft edits stay isolated until an overlap-free apply is ready", () => {
  const parentRules: LinkAlcRules = {
    room: { allowedEmails: ["owner@example.com"], allowedGroupIds: [] },
    folders: [],
    documents: [],
  };

  const draft = createAlcRulesDraft(parentRules);
  draft.room.allowedEmails.push("viewer@example.com");

  assert.deepEqual(parentRules.room.allowedEmails, ["owner@example.com"]);
  assert.deepEqual(prepareAlcRulesApply(draft), {
    status: "ready",
    rules: {
      room: {
        allowedEmails: ["owner@example.com", "viewer@example.com"],
        allowedGroupIds: [],
      },
      folders: [],
      documents: [],
    },
  });
});

test("ALC overlap review defaults every identity to room-wide and applies explicit alternatives", () => {
  const preparation = prepareAlcRulesApply(rulesWithOverlaps);
  assert.equal(preparation.status, "review");
  if (preparation.status !== "review") return;

  assert.deepEqual(preparation.resolutions, {
    "email:viewer@example.com": "keep_room",
    "group:group-finance": "keep_room",
  });

  const resolutions: AlcOverlapResolutionMap = {
    "email:viewer@example.com": "keep_room",
    "group:group-finance": "keep_detailed",
  };
  const resolved = applyAlcRulesReview(rulesWithOverlaps, resolutions);

  assert.deepEqual(resolved, {
    room: {
      allowedEmails: ["viewer@example.com"],
      allowedGroupIds: [],
    },
    folders: [
      {
        folderId: "folder-financials",
        allowedEmails: ["folder-only@example.com"],
        allowedGroupIds: [],
      },
    ],
    documents: [
      {
        documentId: "document-plan",
        allowedEmails: [],
        allowedGroupIds: ["group-finance"],
      },
    ],
  });
  assert.deepEqual(rulesWithOverlaps.room.allowedGroupIds, ["group-finance"]);
});

test("every dialog dismissal path discards its isolated draft without a commit", () => {
  for (const reason of ["cancel", "close", "escape", "backdrop"] as const) {
    const parentRules = createAlcRulesDraft(rulesWithOverlaps);
    const state = createAlcDialogFlowState(parentRules);
    state.draftRules.room.allowedEmails.push("draft-only@example.com");

    const transition = transitionAlcDialogFlow(state, {
      type: "dismiss",
      reason,
    });

    assert.deepEqual(transition.effect, { type: "discard", reason });
    assert.equal(transition.state.phase, "closed");
    assert.equal(transition.state.committedRules, null);
    assert.equal(
      parentRules.room.allowedEmails.includes("draft-only@example.com"),
      false,
    );
  }
});

test("apply commits exactly once without overlaps and blocks persistence until overlap review finishes", () => {
  const plainState = createAlcDialogFlowState({
    room: { allowedEmails: ["viewer@example.com"], allowedGroupIds: [] },
    folders: [],
    documents: [],
  });
  const firstApply = transitionAlcDialogFlow(plainState, { type: "apply" });
  assert.equal(firstApply.effect?.type, "commit");
  const repeatedApply = transitionAlcDialogFlow(firstApply.state, {
    type: "apply",
  });
  assert.equal(repeatedApply.effect, null);

  const overlapState = createAlcDialogFlowState(rulesWithOverlaps);
  const enterReview = transitionAlcDialogFlow(overlapState, { type: "apply" });
  assert.equal(enterReview.effect, null);
  assert.equal(enterReview.state.phase, "review");
  assert.equal(enterReview.state.review?.entryId, 1);

  const chooseDetailed = transitionAlcDialogFlow(enterReview.state, {
    type: "choose_resolution",
    overlapKey: "group:group-finance",
    resolution: "keep_detailed",
  });
  assert.equal(chooseDetailed.effect, null);
  assert.equal(chooseDetailed.state.review?.entryId, 1);

  const finalApply = transitionAlcDialogFlow(chooseDetailed.state, {
    type: "apply",
  });
  assert.equal(finalApply.effect?.type, "commit");
  assert.equal(finalApply.state.phase, "closed");
  assert.deepEqual(finalApply.state.committedRules?.room.allowedGroupIds, []);
});

test("review requests ignore the current value on remount and consume only newer requests", () => {
  const remountedCursor = 4;

  assert.deepEqual(consumeAlcReviewRequest(remountedCursor, 4), {
    cursor: 4,
    shouldOpen: false,
  });
  assert.deepEqual(consumeAlcReviewRequest(remountedCursor, 5), {
    cursor: 5,
    shouldOpen: true,
  });
  assert.deepEqual(consumeAlcReviewRequest(5, 3), {
    cursor: 5,
    shouldOpen: false,
  });
});

test("review metadata blocks final apply while loading, failed, or unresolved", () => {
  const overlaps = prepareAlcRulesApply(rulesWithOverlaps);
  assert.equal(overlaps.status, "review");
  if (overlaps.status !== "review") return;

  const noFolders = new Map<string, string>();
  const noDocuments = new Map<string, string>();
  assert.deepEqual(
    getAlcReviewMetadataState(overlaps.overlaps, {
      isLoading: true,
      error: null,
      folderLabels: noFolders,
      documentLabels: noDocuments,
    }),
    { status: "loading", unresolvedTargets: [] },
  );
  assert.deepEqual(
    getAlcReviewMetadataState(overlaps.overlaps, {
      isLoading: false,
      error: "Unable to load folders and documents.",
      folderLabels: noFolders,
      documentLabels: noDocuments,
    }),
    { status: "error", unresolvedTargets: [] },
  );
  assert.deepEqual(
    getAlcReviewMetadataState(overlaps.overlaps, {
      isLoading: false,
      error: null,
      folderLabels: new Map([["folder-financials", "Financials"]]),
      documentLabels: noDocuments,
    }),
    {
      status: "unresolved",
      unresolvedTargets: [{ scope: "document", targetId: "document-plan" }],
    },
  );
  assert.deepEqual(
    getAlcReviewMetadataState(overlaps.overlaps, {
      isLoading: false,
      error: null,
      folderLabels: new Map([["folder-financials", "Financials"]]),
      documentLabels: new Map([["document-plan", "Plan.pdf"]]),
    }),
    { status: "ready", unresolvedTargets: [] },
  );
});
