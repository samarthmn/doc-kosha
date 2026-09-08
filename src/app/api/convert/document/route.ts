import { after, NextResponse } from "next/server";
import { z } from "zod";
import { DOCUMENT_PROCESSING_OPERATION_TIMEOUT_MS } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import {
  admitDocumentProcessingJob,
  type DocumentProcessingJob,
} from "@/server/documentProcessingQueue";
import {
  engineFailureSchema,
  toPublicEngineErrorResponse,
} from "@/server/engineErrors";
import { isPdfExtension } from "@/lib/fileTypes";
import { isFreePlan } from "@/modules/billing/server/planGuards";

// Keep the serverless invocation above the 150 s in-process conversion
// deadline so claim finalization and cleanup still have time to finish.
export const maxDuration = 180;

const BodySchema = z.object({
  documentId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  force: z.boolean().optional(),
});

export async function POST(req: Request) {
  const deadlineAt = Date.now() + DOCUMENT_PROCESSING_OPERATION_TIMEOUT_MS;
  const supabase = await createSupabaseServerClient();
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { documentId, workspaceId } = parsed.data;
  const force = Boolean(parsed.data.force);

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: entitled, error: entitlementError } = await supabase.rpc(
      "workspace_has_entitlement",
      { ws: workspaceId },
    );
    if (entitlementError || !entitled) {
      return NextResponse.json(
        { error: "Workspace is not entitled" },
        { status: 403 },
      );
    }

    const service = createSupabaseServiceClient();

    // Verify document exists (service role avoids RLS edge cases here)
    const { data: doc, error: docErr } = await service
      .from("documents")
      .select("id, conversion_status, data_room_id, file_type")
      .eq("id", documentId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (docErr) {
      console.error("[convert] failed to load document", docErr);
      return NextResponse.json(
        { error: "Failed to load document" },
        { status: 500 },
      );
    }

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    const { data: canConvert, error: canConvertError } = doc.data_room_id
      ? await supabase.rpc("can_edit_data_room", {
          ws: workspaceId,
          room_id: doc.data_room_id,
        })
      : await supabase.rpc("can_edit_workspace_documents", { ws: workspaceId });

    if (canConvertError || !canConvert) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if ((await isFreePlan(workspaceId)) && !isPdfExtension(doc.file_type)) {
      return NextResponse.json(
        {
          error:
            "Free workspaces support PDF uploads only. Upgrade to convert other file types.",
          code: "FREE_PLAN_PDF_ONLY",
        },
        { status: 403 },
      );
    }

    if (doc.conversion_status === "completed" && !force) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (doc.conversion_status === "in_progress" && !force) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const job: DocumentProcessingJob = { documentId, workspaceId };
    const admission = admitDocumentProcessingJob(job, { force, deadlineAt });
    if (!admission.accepted) {
      try {
        await admission.completion;
      } catch (error) {
        const failure = engineFailureSchema.safeParse(error);
        if (failure.success) {
          const publicFailure = toPublicEngineErrorResponse(failure.data);
          return NextResponse.json(publicFailure.body, {
            status: publicFailure.status,
          });
        }
        throw error;
      }
    }

    after(async () => {
      try {
        await admission.completion;
      } catch (error) {
        console.error("[convert] background processing failed", {
          documentId,
          workspaceId,
          error,
        });
      }
    });

    // Kickoff endpoint: return immediately. UI should use realtime updates.
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    console.error("[convert] unexpected error", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
