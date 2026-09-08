import type {
  LinkAlcDocumentRule,
  LinkAlcFolderRule,
  LinkAlcRules,
} from "@/lib/linkAlcClient";

export type AlcRoomOverlapTarget = {
  scope: "folder" | "document";
  targetId: string;
};

export type AlcRoomOverlap = {
  key: string;
  kind: "email" | "group";
  displayValue: string;
  targets: AlcRoomOverlapTarget[];
};

export type AlcOverlapResolution = "keep_room" | "keep_detailed";

export type AlcOverlapResolutionMap = Readonly<
  Record<string, AlcOverlapResolution>
>;

type AlcIdentity = Pick<AlcRoomOverlap, "key" | "kind" | "displayValue">;

const compareText = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

const getEmailIdentity = (value: string): AlcIdentity | null => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  return {
    key: `email:${normalized}`,
    kind: "email",
    displayValue: normalized,
  };
};

const getGroupIdentity = (value: string): AlcIdentity | null => {
  if (!value.trim()) return null;

  return {
    key: `group:${value}`,
    kind: "group",
    displayValue: value,
  };
};

const getRuleIdentities = (
  allowedEmails: string[],
  allowedGroupIds: string[],
): AlcIdentity[] => {
  const identities = new Map<string, AlcIdentity>();

  for (const email of allowedEmails) {
    const identity = getEmailIdentity(email);
    if (identity) identities.set(identity.key, identity);
  }

  for (const groupId of allowedGroupIds) {
    const identity = getGroupIdentity(groupId);
    if (identity) identities.set(identity.key, identity);
  }

  return Array.from(identities.values());
};

const isEmptyRule = (
  rule: Pick<
    LinkAlcFolderRule | LinkAlcDocumentRule,
    "allowedEmails" | "allowedGroupIds"
  >,
): boolean =>
  rule.allowedEmails.length === 0 && rule.allowedGroupIds.length === 0;

const filterValues = (
  values: string[],
  getIdentity: (value: string) => AlcIdentity | null,
  identitiesToRemove: ReadonlySet<string>,
): string[] =>
  values.filter((value) => {
    const identity = getIdentity(value);
    return !identity || !identitiesToRemove.has(identity.key);
  });

/**
 * Lists identities that grant both the whole room and one or more detailed
 * targets. Email and group identities are intentionally disjoint: this
 * function neither reads nor infers group membership.
 */
export const findRoomWideAlcOverlaps = (
  rules: LinkAlcRules,
): AlcRoomOverlap[] => {
  const roomIdentities = new Map<string, AlcIdentity>();
  for (const identity of getRuleIdentities(
    rules.room.allowedEmails,
    rules.room.allowedGroupIds,
  )) {
    roomIdentities.set(identity.key, identity);
  }

  const overlaps = new Map<string, AlcRoomOverlap>();
  const addDetailedRule = (
    scope: AlcRoomOverlapTarget["scope"],
    targetId: string,
    allowedEmails: string[],
    allowedGroupIds: string[],
  ): void => {
    for (const identity of getRuleIdentities(allowedEmails, allowedGroupIds)) {
      if (!roomIdentities.has(identity.key)) continue;

      const overlap = overlaps.get(identity.key) ?? {
        ...identity,
        targets: [],
      };
      overlaps.set(identity.key, overlap);

      if (
        !overlap.targets.some(
          (target) => target.scope === scope && target.targetId === targetId,
        )
      ) {
        overlap.targets.push({ scope, targetId });
      }
    }
  };

  for (const rule of rules.folders) {
    addDetailedRule(
      "folder",
      rule.folderId,
      rule.allowedEmails,
      rule.allowedGroupIds,
    );
  }
  for (const rule of rules.documents) {
    addDetailedRule(
      "document",
      rule.documentId,
      rule.allowedEmails,
      rule.allowedGroupIds,
    );
  }

  return Array.from(overlaps.values())
    .sort((left, right) => compareText(left.key, right.key))
    .map((overlap) => ({
      ...overlap,
      targets: overlap.targets.sort(
        (left, right) =>
          compareText(left.scope, right.scope) ||
          compareText(left.targetId, right.targetId),
      ),
    }));
};

const assertCompleteResolutions = (
  overlaps: AlcRoomOverlap[],
  resolutions: Readonly<Record<string, unknown>>,
): void => {
  const overlapKeys = new Set(overlaps.map((overlap) => overlap.key));

  for (const key of overlapKeys) {
    if (!(key in resolutions)) {
      throw new Error(`Missing resolution for overlap ${key}`);
    }
  }

  for (const [key, resolution] of Object.entries(resolutions)) {
    if (!overlapKeys.has(key)) {
      throw new Error(`Unknown overlap resolution ${key}`);
    }
    if (resolution !== "keep_room" && resolution !== "keep_detailed") {
      throw new Error(`Invalid resolution for overlap ${key}`);
    }
  }
};

export function resolveRoomWideAlcOverlaps(
  rules: LinkAlcRules,
  resolutions: AlcOverlapResolutionMap,
): LinkAlcRules;
export function resolveRoomWideAlcOverlaps(
  rules: LinkAlcRules,
  resolutions: Readonly<Record<string, unknown>>,
): LinkAlcRules;
/**
 * Resolves every current room-wide overlap without changing the meaning or
 * ordering of unrelated rules. Invalid decision maps fail rather than making
 * an implicit access-control choice.
 */
export function resolveRoomWideAlcOverlaps(
  rules: LinkAlcRules,
  resolutions: Readonly<Record<string, unknown>>,
): LinkAlcRules {
  const overlaps = findRoomWideAlcOverlaps(rules);
  assertCompleteResolutions(overlaps, resolutions);

  const removeFromRoom = new Set<string>();
  const removeFromDetailed = new Set<string>();
  for (const overlap of overlaps) {
    const resolution = resolutions[overlap.key];
    if (resolution === "keep_room") {
      removeFromDetailed.add(overlap.key);
    } else {
      removeFromRoom.add(overlap.key);
    }
  }

  const resolveFolderRule = (rule: LinkAlcFolderRule): LinkAlcFolderRule => ({
    ...rule,
    allowedEmails: filterValues(
      rule.allowedEmails,
      getEmailIdentity,
      removeFromDetailed,
    ),
    allowedGroupIds: filterValues(
      rule.allowedGroupIds,
      getGroupIdentity,
      removeFromDetailed,
    ),
  });
  const resolveDocumentRule = (
    rule: LinkAlcDocumentRule,
  ): LinkAlcDocumentRule => ({
    ...rule,
    allowedEmails: filterValues(
      rule.allowedEmails,
      getEmailIdentity,
      removeFromDetailed,
    ),
    allowedGroupIds: filterValues(
      rule.allowedGroupIds,
      getGroupIdentity,
      removeFromDetailed,
    ),
  });

  return {
    room: {
      ...rules.room,
      allowedEmails: filterValues(
        rules.room.allowedEmails,
        getEmailIdentity,
        removeFromRoom,
      ),
      allowedGroupIds: filterValues(
        rules.room.allowedGroupIds,
        getGroupIdentity,
        removeFromRoom,
      ),
    },
    folders: rules.folders
      .map((rule) => ({
        wasEmpty: isEmptyRule(rule),
        resolved: resolveFolderRule(rule),
      }))
      .filter(({ wasEmpty, resolved }) => wasEmpty || !isEmptyRule(resolved))
      .map(({ resolved }) => resolved),
    documents: rules.documents
      .map((rule) => ({
        wasEmpty: isEmptyRule(rule),
        resolved: resolveDocumentRule(rule),
      }))
      .filter(({ wasEmpty, resolved }) => wasEmpty || !isEmptyRule(resolved))
      .map(({ resolved }) => resolved),
  };
}
