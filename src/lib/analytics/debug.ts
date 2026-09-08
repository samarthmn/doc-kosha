const isProductionAppEnv = (): boolean =>
  (process.env.NEXT_PUBLIC_APP_ENV ?? "").trim().toLowerCase() === "production";

export const analyticsDebugLog = (...args: unknown[]) => {
  if (isProductionAppEnv()) {
    return;
  }
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug("[analytics]", ...args);
  }
};
