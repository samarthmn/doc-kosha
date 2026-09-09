import { z } from "zod";

/** Best-effort browser optimization only. The server independently verifies the JWT. */
export const createLoginActivityObserver = (
  send: (accessToken: string) => Promise<void>,
) => {
  const completed = new Set<string>();
  const pending = new Map<string, Promise<void>>();
  return async (event: string, accessToken: string | null): Promise<void> => {
    if ((event !== "INITIAL_SESSION" && event !== "SIGNED_IN") || !accessToken)
      return;
    let sessionId: string;
    try {
      const payload = accessToken.split(".")[1];
      const claims = JSON.parse(
        atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
      );
      sessionId = z
        .object({ session_id: z.string().uuid() })
        .parse(claims).session_id;
    } catch {
      return;
    }
    if (completed.has(sessionId)) return;
    const existing = pending.get(sessionId);
    if (existing) return existing;
    const request = Promise.resolve()
      .then(() => send(accessToken))
      .then(() => {
        completed.add(sessionId);
        if (completed.size > 32)
          completed.delete(completed.values().next().value!);
      })
      .finally(() => {
        pending.delete(sessionId);
      });
    pending.set(sessionId, request);
    return request;
  };
};
