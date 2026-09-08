"use client";

import { isLinkedInInsightEnabled } from "@/lib/deployment";

const WORKSPACE_PLAN_SELECTION_CONVERSION_ID = 24644956;

export const trackLinkedInWorkspacePlanSelection = (): boolean => {
  if (!isLinkedInInsightEnabled()) return false;
  if (typeof window === "undefined") return false;
  if (typeof window.lintrk !== "function") return false;

  window.lintrk("track", {
    conversion_id: WORKSPACE_PLAN_SELECTION_CONVERSION_ID,
  });
  return true;
};
