import { NextResponse } from "next/server";
import { z } from "zod";
import type { AdvancedAnalyticsRequestDeps } from "../../types";

const RequestSchema = z.object({
  workspaceId: z.string().uuid(),
  documentId: z.string().uuid(),
  linkIds: z.array(z.string().uuid()).min(1),
  from: z.string().datetime().nullable().optional(),
  to: z.string().datetime().nullable().optional(),
  contentPaths: z.array(z.string().min(1)).nullable().optional(),
  filenameHint: z.string().min(1).max(120).optional(),
});

const escapeCsvCell = (value: string): string => {
  // Normalize first, then mitigate CSV injection ("formula injection") by
  // prefixing leading dangerous characters with a single quote.
  //
  // We check the first non-whitespace character so values like "  =1+1" are also
  // mitigated.
  const normalizedRaw = value.normalize("NFKC");
  const needsMitigation = /^[=+\-@]/.test(normalizedRaw.trimStart());
  const normalized = normalizedRaw.replace(/[\r\n]+/g, " ").trim();
  const mitigated = needsMitigation ? `'${normalized}` : normalized;
  const escaped = mitigated.replace(/"/g, '""');
  return `"${escaped}"`;
};

const toSafeFilename = (hint: string | undefined): string => {
  const base = (hint ?? "viewer-insights")
    .trim()
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const name = base || "viewer-insights";
  return name.toLowerCase().endsWith(".csv") ? name : `${name}.csv`;
};

export async function handleViewerInsightsExportRequest(
  req: Request,
  deps: AdvancedAnalyticsRequestDeps,
): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const { workspaceId, documentId, linkIds, from, to, contentPaths } =
      parsed.data;

    const supabase = await deps.createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const { data: isMember, error: memberError } = await supabase.rpc(
      "is_workspace_member",
      { ws: workspaceId },
    );
    if (memberError) {
      return NextResponse.json(
        { error: "Server error", code: "SERVER_ERROR" },
        { status: 500 },
      );
    }
    if (!isMember) {
      return NextResponse.json(
        { error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    // Viewer insights can include verified viewer email addresses. Keep this
    // export owner-only even though the underlying analytics reads are
    // available to workspace members.
    const { data: isOwner, error: ownerError } = await supabase.rpc(
      "has_workspace_role",
      { ws: workspaceId, roles: ["owner"] },
    );
    if (ownerError) {
      return NextResponse.json(
        { error: "Server error", code: "SERVER_ERROR" },
        { status: 500 },
      );
    }
    if (!isOwner) {
      return NextResponse.json(
        { error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("id, workspace_id")
      .eq("id", documentId)
      .maybeSingle();
    if (docError) {
      return NextResponse.json(
        { error: "Server error", code: "SERVER_ERROR" },
        { status: 500 },
      );
    }
    if (!doc || doc.workspace_id !== workspaceId) {
      return NextResponse.json(
        { error: "Document not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const { data: linkRows, error: linkError } = await supabase
      .from("links")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .in("id", linkIds);

    if (linkError) {
      return NextResponse.json(
        { error: "Server error", code: "SERVER_ERROR" },
        { status: 500 },
      );
    }

    const linkNameById = new Map<string, string>();
    (linkRows ?? []).forEach((row) =>
      linkNameById.set(row.id, row.name || row.id),
    );

    const { data, error } = await supabase.rpc(
      "get_document_viewer_insights_export_v2",
      {
        p_workspace_id: workspaceId,
        p_document_id: documentId,
        p_link_ids: linkIds,
        p_content_paths: contentPaths ?? undefined,
        p_from_ts: from ?? undefined,
        p_to_ts: to ?? undefined,
      },
    );

    if (error) {
      return NextResponse.json(
        { error: "Export failed", code: "EXPORT_FAILED" },
        { status: 500 },
      );
    }

    const rows = (data ?? []) as Array<{
      viewer_email: string;
      viewer_key: string;
      view_count: number;
      download_count: number;
      total_time_ms: number;
      last_seen_at: string;
      link_id: string;
      content_path: string;
    }>;

    const header = [
      "viewer_email",
      "viewer_key",
      "views",
      "downloads",
      "total_time_seconds",
      "last_seen_at",
      "link_id",
      "link_name",
      "document_id",
      "content_path",
    ];

    const lines: string[] = [header.map(escapeCsvCell).join(",")];

    rows.forEach((row) => {
      const totalSeconds = Math.round((Number(row.total_time_ms) || 0) / 1000);
      const linkName = linkNameById.get(row.link_id) ?? row.link_id;
      lines.push(
        [
          row.viewer_email ?? "",
          row.viewer_key ?? "",
          String(Number(row.view_count) || 0),
          String(Number(row.download_count) || 0),
          String(totalSeconds),
          row.last_seen_at ?? "",
          row.link_id ?? "",
          linkName,
          documentId,
          row.content_path ?? "",
        ]
          .map((cell) => escapeCsvCell(cell))
          .join(","),
      );
    });

    const csv = `${lines.join("\n")}\n`;
    const filename = toSafeFilename(parsed.data.filenameHint);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[analytics.export.viewer-insights] failed", err);
    return NextResponse.json(
      { error: "Server error", code: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
