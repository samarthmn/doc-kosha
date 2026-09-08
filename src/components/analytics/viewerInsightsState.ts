type ViewerInsightsRpcState = "disabled" | "ready" | "error";

export const resolveViewerInsightsRpcState = (input: {
  enabled: boolean;
  viewerRowsError: unknown;
  viewerPagesError: unknown;
}): ViewerInsightsRpcState => {
  if (!input.enabled) return "disabled";
  if (input.viewerRowsError || input.viewerPagesError) return "error";
  return "ready";
};
