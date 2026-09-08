import { PlanDefinition, PlanId, PlanLimits } from "./types";

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    maxDataRooms: null,
    maxStorageBytes: 250 * MB,
    maxBandwidthBytes: 2 * GB,
    maxMembers: 1,
    allowedDocumentExtensions: ["pdf"],
    maxPreviousVersions: 0,
    canUseCustomDomains: false,
    canRemoveBranding: false,
  },
  essential: {
    maxDataRooms: null,
    maxStorageBytes: 5 * GB,
    maxBandwidthBytes: null, // No bandwidth cap (fair use)
    maxMembers: null,
    allowedDocumentExtensions: null,
    maxPreviousVersions: null,
    canUseCustomDomains: true,
    canRemoveBranding: true,
  },
  plus: {
    maxDataRooms: null,
    maxStorageBytes: 30 * GB,
    maxBandwidthBytes: null, // No bandwidth cap (fair use)
    maxMembers: null,
    allowedDocumentExtensions: null,
    maxPreviousVersions: null,
    canUseCustomDomains: true,
    canRemoveBranding: true,
  },
  max: {
    maxDataRooms: null,
    maxStorageBytes: 200 * GB,
    maxBandwidthBytes: null, // No bandwidth cap (fair use)
    maxMembers: null,
    allowedDocumentExtensions: null,
    maxPreviousVersions: null,
    canUseCustomDomains: true,
    canRemoveBranding: true,
  },
};

export const PLAN_CATALOG: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    description: "PDF-only document sharing for getting started.",
    limits: PLAN_LIMITS.free,
    hasTrial: false,
  },
  essential: {
    id: "essential",
    name: "Essential",
    description: "Usage-based plan with included storage.",
    limits: PLAN_LIMITS.essential,
    hasTrial: true,
  },
  plus: {
    id: "plus",
    name: "Plus",
    description: "Higher included storage for growing teams.",
    limits: PLAN_LIMITS.plus,
    hasTrial: false,
  },
  max: {
    id: "max",
    name: "Max",
    description: "Maximum included storage for large teams.",
    limits: PLAN_LIMITS.max,
    hasTrial: false,
  },
};
