import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { z } from "zod";
import { STORAGE_BUCKET_NAME } from "@/lib/constants";
import { presignGetObject } from "@/server/storage";

const RequestSchema = z.object({
  signatureId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = RequestSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { signatureId } = result.data;
    const supabase = await createSupabaseServerClient();

    // 1. Verify User Session
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch NDA Signature metadata to check permissions
    const { data: signature, error: sigError } = await supabase
      .from("nda_signatures")
      .select("id, workspace_id, signed_pdf_path, full_name")
      .eq("id", signatureId)
      .maybeSingle();

    if (sigError || !signature) {
      return NextResponse.json(
        { error: "Signature not found" },
        { status: 404 },
      );
    }

    // 3. Verify User is a member of the Workspace
    // We check this using the RLS-protected `workspace_members` table or RPC depending on setup.
    // Since `supabase` is the server client with user context, querying `workspaces` or `workspace_members`
    // will strictly enforce RLS. If we can find the workspace in their list, they have access.

    const { data: membership, error: memberError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", signature.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError || !membership) {
      return NextResponse.json(
        { error: "Forbidden: Not a workspace member" },
        { status: 403 },
      );
    }

    // 4. Generate Signed URL using Service Role
    // This allows us to bypassing storage bucket RLS implementation details (like restricted paths)
    if (!signature.signed_pdf_path) {
      return NextResponse.json(
        { error: "File path missing on record" },
        { status: 404 },
      );
    }

    const safeName = (signature.full_name || "Viewer")
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .trim();
    const downloadFilename = `${safeName} - NDA_Signed.pdf`;

    // Generate presigned URL using R2
    let signedUrl: string;
    try {
      signedUrl = await presignGetObject({
        logicalBucket: STORAGE_BUCKET_NAME,
        path: signature.signed_pdf_path,
        expiresInSeconds: 60,
        responseContentDisposition: `attachment; filename="${downloadFilename}"`,
        responseContentType: "application/pdf",
      });
    } catch (storageError) {
      console.error("[NDA Proxy] Signed URL generation failed", storageError);
      return NextResponse.json(
        { error: "Failed to generate download link" },
        { status: 500 },
      );
    }

    return NextResponse.json({ signedUrl });
  } catch (err) {
    console.error("[NDA Proxy] Unexpected error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
