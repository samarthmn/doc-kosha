/// <reference path="../deno.d.ts" />

const json = (body: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const normalizeUrl = (value: string): string => value.replace(/\/+$/, "");

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const workerSecret = Deno.env.get("LIFECYCLE_PROCESSOR_SECRET")?.trim();
  const providedSecret = req.headers
    .get("x-lifecycle-processor-secret")
    ?.trim();
  const appUrl = Deno.env.get("NEXT_PUBLIC_APP_URL")?.trim();

  if (!workerSecret || providedSecret !== workerSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!appUrl) {
    return json({ error: "NEXT_PUBLIC_APP_URL is not configured" }, 500);
  }

  const processorUrl = `${normalizeUrl(appUrl)}/api/internal/lifecycle/process`;
  const upstreamResponse = await fetch(processorUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${workerSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      limit: 25,
      includeBackfills: true,
      includeInactiveSweep: true,
    }),
  });

  const body = await upstreamResponse.text();
  return new Response(body, {
    status: upstreamResponse.status,
    headers: {
      "Content-Type":
        upstreamResponse.headers.get("content-type") ?? "application/json",
    },
  });
});
