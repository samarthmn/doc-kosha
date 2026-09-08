import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/generated/supabase";

type DocumentConversionPayload = {
  documentId: string;
  workspaceId: string;
  force?: boolean;
};

type DocumentConversionResult = {
  ok: boolean;
  status: number;
  message?: string;
};

const CONVERT_DOCUMENT_ENDPOINT = "/api/convert/document";

const requestDocumentConversion = async (
  payload: DocumentConversionPayload,
): Promise<DocumentConversionResult> => {
  try {
    const response = await fetch(CONVERT_DOCUMENT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return { ok: true, status: response.status };
    }

    let message: string | undefined;
    try {
      const parsed = (await response.json()) as { error?: unknown } | null;
      if (parsed && typeof parsed.error === "string") {
        message = parsed.error;
      }
    } catch {
      // ignore parse errors – message will remain undefined
    }

    return { ok: false, status: response.status, message };
  } catch (error) {
    const fallbackMessage =
      error instanceof Error ? error.message : "Network error";
    return { ok: false, status: 0, message: fallbackMessage };
  }
};

type DocumentConversionRow = {
  id: string;
  title: string;
  file_type: string;
  size_bytes: number;
  num_pages: number | null;
  storage_path: string;
  converted_storage_path: string | null;
  conversion_status?: string | null;
  workspace_id?: string | null;
};

type DocumentConversionRetryOptions = {
  supabase: SupabaseClient<Database>;
  documentId: string;
  workspaceId: string;
};

export const retryDocumentConversion = async ({
  supabase,
  documentId,
  workspaceId,
}: DocumentConversionRetryOptions): Promise<DocumentConversionRow | null> => {
  const result = await requestDocumentConversion({
    documentId,
    workspaceId,
    force: true,
  });

  if (!result.ok) {
    console.warn(
      "[DocumentConversion] Conversion request failed",
      result.status,
      result.message,
    );
  }

  // Allow a short delay for the conversion pipeline to update storage & DB.
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, title, file_type, size_bytes, num_pages, storage_path, converted_storage_path, conversion_status, workspace_id",
    )
    .eq("id", documentId)
    .single();

  if (error || !data) {
    console.error(
      "[DocumentConversion] Failed to reload document after conversion",
      error,
    );
    return null;
  }

  return data as DocumentConversionRow;
};
