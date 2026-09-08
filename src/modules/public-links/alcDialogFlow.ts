import type { LinkAlcRules } from "@/lib/linkAlcClient";
import {
  findRoomWideAlcOverlaps,
  resolveRoomWideAlcOverlaps,
  type AlcOverlapResolution,
  type AlcOverlapResolutionMap,
  type AlcRoomOverlap,
  type AlcRoomOverlapTarget,
} from "./alcRoomOverlap";

type AlcRulesApplyPreparation =
  | { status: "ready"; rules: LinkAlcRules }
  | {
      status: "review";
      overlaps: AlcRoomOverlap[];
      resolutions: AlcOverlapResolutionMap;
    };

export const createAlcRulesDraft = (rules: LinkAlcRules): LinkAlcRules => ({
  room: {
    allowedEmails: [...rules.room.allowedEmails],
    allowedGroupIds: [...rules.room.allowedGroupIds],
  },
  folders: rules.folders.map((rule) => ({
    ...rule,
    allowedEmails: [...rule.allowedEmails],
    allowedGroupIds: [...rule.allowedGroupIds],
  })),
  documents: rules.documents.map((rule) => ({
    ...rule,
    allowedEmails: [...rule.allowedEmails],
    allowedGroupIds: [...rule.allowedGroupIds],
  })),
});

export const prepareAlcRulesApply = (
  rules: LinkAlcRules,
): AlcRulesApplyPreparation => {
  const draft = createAlcRulesDraft(rules);
  const overlaps = findRoomWideAlcOverlaps(draft);
  if (overlaps.length === 0) return { status: "ready", rules: draft };

  return {
    status: "review",
    overlaps,
    resolutions: Object.fromEntries(
      overlaps.map((overlap) => [overlap.key, "keep_room"]),
    ),
  };
};

export const applyAlcRulesReview = (
  rules: LinkAlcRules,
  resolutions: AlcOverlapResolutionMap,
): LinkAlcRules =>
  createAlcRulesDraft(resolveRoomWideAlcOverlaps(rules, resolutions));

export type AlcDialogDismissReason = "cancel" | "close" | "escape" | "backdrop";

type AlcDialogReviewState = {
  entryId: number;
  overlaps: AlcRoomOverlap[];
  resolutions: AlcOverlapResolutionMap;
};

type AlcDialogFlowState = {
  phase: "rules" | "review" | "closed";
  draftRules: LinkAlcRules;
  review: AlcDialogReviewState | null;
  committedRules: LinkAlcRules | null;
};

type AlcDialogFlowEvent =
  | { type: "apply" }
  | {
      type: "choose_resolution";
      overlapKey: string;
      resolution: AlcOverlapResolution;
    }
  | { type: "dismiss"; reason: AlcDialogDismissReason };

type AlcDialogFlowEffect =
  | { type: "commit"; rules: LinkAlcRules }
  | { type: "discard"; reason: AlcDialogDismissReason };

type AlcDialogFlowTransition = {
  state: AlcDialogFlowState;
  effect: AlcDialogFlowEffect | null;
};

const enterReview = (
  state: AlcDialogFlowState,
  preparation: Extract<AlcRulesApplyPreparation, { status: "review" }>,
): AlcDialogFlowState => ({
  ...state,
  phase: "review",
  review: {
    entryId: (state.review?.entryId ?? 0) + 1,
    overlaps: preparation.overlaps,
    resolutions: preparation.resolutions,
  },
});

export const createAlcDialogFlowState = (
  rules: LinkAlcRules,
  options?: { openInReview?: boolean },
): AlcDialogFlowState => {
  const state: AlcDialogFlowState = {
    phase: "rules",
    draftRules: createAlcRulesDraft(rules),
    review: null,
    committedRules: null,
  };
  if (!options?.openInReview) return state;

  const preparation = prepareAlcRulesApply(state.draftRules);
  return preparation.status === "review"
    ? enterReview(state, preparation)
    : state;
};

export const transitionAlcDialogFlow = (
  state: AlcDialogFlowState,
  event: AlcDialogFlowEvent,
): AlcDialogFlowTransition => {
  if (state.phase === "closed") return { state, effect: null };

  if (event.type === "dismiss") {
    return {
      state: {
        ...state,
        phase: "closed",
        review: null,
        committedRules: null,
      },
      effect: { type: "discard", reason: event.reason },
    };
  }

  if (event.type === "choose_resolution") {
    if (!state.review || !(event.overlapKey in state.review.resolutions)) {
      return { state, effect: null };
    }
    return {
      state: {
        ...state,
        review: {
          ...state.review,
          resolutions: {
            ...state.review.resolutions,
            [event.overlapKey]: event.resolution,
          },
        },
      },
      effect: null,
    };
  }

  if (state.review) {
    const rules = applyAlcRulesReview(
      state.draftRules,
      state.review.resolutions,
    );
    return {
      state: {
        ...state,
        phase: "closed",
        review: null,
        committedRules: rules,
      },
      effect: { type: "commit", rules },
    };
  }

  const preparation = prepareAlcRulesApply(state.draftRules);
  if (preparation.status === "review") {
    return { state: enterReview(state, preparation), effect: null };
  }

  return {
    state: {
      ...state,
      phase: "closed",
      committedRules: preparation.rules,
    },
    effect: { type: "commit", rules: preparation.rules },
  };
};

export const consumeAlcReviewRequest = (
  cursor: number,
  request: number,
): { cursor: number; shouldOpen: boolean } =>
  request > cursor
    ? { cursor: request, shouldOpen: true }
    : { cursor, shouldOpen: false };

type AlcReviewMetadataInput = {
  isLoading: boolean;
  error: string | null;
  folderLabels: ReadonlyMap<string, string>;
  documentLabels: ReadonlyMap<string, string>;
};

type AlcReviewMetadataState = {
  status: "loading" | "error" | "unresolved" | "ready";
  unresolvedTargets: AlcRoomOverlapTarget[];
};

export const getAlcReviewMetadataState = (
  overlaps: AlcRoomOverlap[],
  input: AlcReviewMetadataInput,
): AlcReviewMetadataState => {
  if (input.isLoading) return { status: "loading", unresolvedTargets: [] };
  if (input.error) return { status: "error", unresolvedTargets: [] };

  const unresolved = new Map<string, AlcRoomOverlapTarget>();
  for (const overlap of overlaps) {
    for (const target of overlap.targets) {
      const label =
        target.scope === "folder"
          ? input.folderLabels.get(target.targetId)
          : input.documentLabels.get(target.targetId);
      if (label?.trim()) continue;
      unresolved.set(`${target.scope}:${target.targetId}`, target);
    }
  }

  const unresolvedTargets = Array.from(unresolved.values()).sort(
    (left, right) =>
      left.scope.localeCompare(right.scope) ||
      left.targetId.localeCompare(right.targetId),
  );
  return {
    status: unresolvedTargets.length === 0 ? "ready" : "unresolved",
    unresolvedTargets,
  };
};
