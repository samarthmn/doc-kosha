import type { ClientGroupsFeature } from "./types";

export type * from "./types";

export const groups = {
  loadManagementComponent: () => import("./UserGroupsPage"),
  loadAlcGroupPicker: () => import("./AlcGroupPicker"),
  fetchLinkAlcGroupRules: async (...args) => {
    const { fetchLinkAlcGroupRules } = await import("./client/alcGroupRules");
    return fetchLinkAlcGroupRules(...args);
  },
} satisfies ClientGroupsFeature;
