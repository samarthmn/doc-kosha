/**
 * Inline recovery watchdog for the public recipient routes (/d, /r).
 *
 * When a JS chunk fails to load (stale chunk URLs after a deploy, a blocked
 * request, a flaky network), client hydration dies before React mounts, so
 * neither error.tsx nor global-error ever renders — recipients are stuck on
 * the server-rendered loading screen with no way forward. Worse, some chunk
 * failures surface only as resource error events that can fire before any
 * body script has registered a listener, so event listening alone is not
 * reliable. This script therefore recovers without React on two signals:
 *
 * 1. Fast path: window "error" / "unhandledrejection" events that look like
 *    chunk-load failures.
 * 2. Backstop: a post-`load` hydration deadline. PublicHydrationMarker (in
 *    the /d and /r layouts) sets `__dkPublicHydrated` when React mounts; if
 *    the flag never appears, hydration is dead regardless of why.
 *
 * Recovery reloads once per short window (fresh HTML references fresh chunk
 * URLs, which resolves the stale-deploy case) and falls back to a plain
 * reload prompt when reloading did not help. It self-gates to /d and /r.
 */
export const publicChunkRecoveryScript = `(function () {
  if (!/^\\/(d|r)\\//.test(window.location.pathname)) return;
  var RELOAD_KEY = "dk-chunk-recovery:" + window.location.pathname;
  var RELOAD_WINDOW_MS = 30000;
  var HYDRATION_GRACE_MS = 8000;

  var isChunkLoadError = function (candidate) {
    if (!candidate) return false;
    var name = typeof candidate.name === "string" ? candidate.name : "";
    if (name === "ChunkLoadError") return true;
    var message = typeof candidate.message === "string" ? candidate.message : String(candidate);
    return /Failed to load chunk|Loading chunk .* failed|error loading dynamically imported module|Importing a module script failed/i.test(message);
  };

  var showReloadPrompt = function () {
    if (!document.body || document.getElementById("dk-chunk-recovery-prompt")) return;
    var overlay = document.createElement("div");
    overlay.id = "dk-chunk-recovery-prompt";
    overlay.setAttribute("role", "alert");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background-color:Canvas;color:CanvasText;text-align:center;";
    var box = document.createElement("div");
    box.style.cssText = "max-width:26rem;font:14px/1.6 system-ui,sans-serif;";
    var text = document.createElement("p");
    text.textContent = "This page could not finish loading. Check your connection or any content blockers, then reload.";
    text.style.cssText = "margin:0 0 16px;";
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = "Reload page";
    button.style.cssText = "font:inherit;padding:8px 20px;border-radius:6px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;";
    button.onclick = function () { window.location.reload(); };
    box.appendChild(text);
    box.appendChild(button);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  };

  var recover = function () {
    if (window.__dkPublicHydrated) return;
    var lastReloadAt = 0;
    try {
      lastReloadAt = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
    } catch (storageError) {}
    if (Date.now() - lastReloadAt > RELOAD_WINDOW_MS) {
      try {
        window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
        return;
      } catch (storageError) {}
    }
    showReloadPrompt();
  };

  window.addEventListener("error", function (event) {
    if (event && isChunkLoadError(event.error)) recover();
  }, true);
  window.addEventListener("unhandledrejection", function (event) {
    if (event && isChunkLoadError(event.reason)) recover();
  });

  var armHydrationDeadline = function () {
    window.setTimeout(function () {
      if (!window.__dkPublicHydrated) recover();
    }, HYDRATION_GRACE_MS);
  };
  if (document.readyState === "complete") {
    armHydrationDeadline();
  } else {
    window.addEventListener("load", armHydrationDeadline);
  }
})();`;
