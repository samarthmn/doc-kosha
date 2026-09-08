import { StorageKeys } from "@/types/storage";

/**
 * Parser-blocking inline script that applies the persisted theme class to
 * <html> before first paint, preventing a wrong-theme flash on full loads.
 * ThemeClassApplier owns all post-hydration updates (including the /d/ and
 * /r/ public-route override, which this script mirrors for the first paint).
 */
export const themeInitScript = `(function () {
  try {
    var themes = ["light", "dark", "copper", "forest", "lavender", "midnight", "ocean", "sunset"];
    var theme = "system";
    try {
      var raw = window.localStorage.getItem("${StorageKeys.GlobalStore}");
      if (raw) {
        var stored = JSON.parse(raw);
        var candidate = stored && stored.state && stored.state.theme;
        if (typeof candidate === "string") theme = candidate;
      }
    } catch (storageError) {}
    var isPublicRoute = /^\\/(d|r)\\//.test(window.location.pathname);
    if (isPublicRoute || themes.indexOf(theme) === -1) theme = "system";
    if (theme === "system") {
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.classList.add(theme);
  } catch (error) {
    try {
      document.documentElement.classList.add(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } catch (fallbackError) {}
  }
})();`;
