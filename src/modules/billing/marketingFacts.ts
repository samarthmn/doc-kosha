import { getPlanLimitLabels } from "./entitlements";

// Marketing surfaces print whole-number figures ("2 GB", not "2.0 GB").
const tidyLimitLabel = (label: string): string => label.replace(/\.0 /, " ");

/**
 * Single source for the Free-plan figures and limitation copy repeated across
 * marketing surfaces (pricing cards, fact pages, JSON-LD offers). Numbers are
 * derived from PLAN_LIMITS via getPlanLimitLabels so a plan change is a
 * one-file edit.
 */
export const getFreePlanMarketingFacts = (): {
  storage: string;
  bandwidth: string;
  bandwidthPerMonth: string;
  members: string;
  uploads: string;
  branding: string;
  customDomains: string;
  previousVersions: string;
  offerDescription: string;
} => {
  const limits = getPlanLimitLabels("free");
  const storage = tidyLimitLabel(limits.storage);
  const bandwidth = tidyLimitLabel(limits.bandwidth);
  const members = limits.members;

  return {
    storage,
    bandwidth,
    bandwidthPerMonth: `${bandwidth} / month`,
    members,
    uploads: "PDF uploads only",
    branding: "DocKosha branding required",
    customDomains: "No custom domains",
    previousVersions: "No retained previous versions",
    offerDescription: `${storage} storage, ${bandwidth}/month public bandwidth, PDF-only uploads, one workspace member, and DocKosha branding required.`,
  };
};
