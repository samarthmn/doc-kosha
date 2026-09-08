import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../../src/types/generated/supabase";
import { getE2EEnv } from "./env";

type ServiceClient = SupabaseClient<Database>;

export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
export type LinkRow = Database["public"]["Tables"]["links"]["Row"];
type DocumentVersionRow =
  Database["public"]["Tables"]["document_versions"]["Row"];
type DataRoomRow = Database["public"]["Tables"]["data_rooms"]["Row"];
type FolderRow = Database["public"]["Tables"]["folders"]["Row"];
type NdaSignatureRow = Database["public"]["Tables"]["nda_signatures"]["Row"];
type WorkspaceStorageCurrentRow =
  Database["public"]["Tables"]["workspace_storage_current"]["Row"];
type WorkspaceBandwidthDailyRow =
  Database["public"]["Tables"]["workspace_bandwidth_daily"]["Row"];
type WorkspaceSubscriptionRow =
  Database["public"]["Tables"]["workspace_subscriptions"]["Row"];
type MutationFailure = {
  code: string | null;
  message: string;
};

const sleep = async (ms: number): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

let serviceClient: ServiceClient | null = null;

const getServiceClient = (): ServiceClient => {
  if (serviceClient) return serviceClient;
  const env = getE2EEnv();
  serviceClient = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  return serviceClient;
};

export const getAuthUserIdByEmail = async (email: string): Promise<string> => {
  const { data, error } = await getServiceClient().rpc(
    "auth_user_id_by_email",
    {
      p_email: email.trim().toLowerCase(),
    },
  );
  if (error || !data) {
    throw new Error(`Failed to resolve auth user id: ${error?.message}`);
  }
  return data;
};

export const generateEmailOtpOrLink = async (args: {
  email: string;
  redirectTo: string;
}): Promise<{ emailOtp: string | null; actionLink: string | null }> => {
  const svc = getServiceClient();
  const email = args.email.trim().toLowerCase();

  const generate = async () => {
    const { data, error } = await svc.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: args.redirectTo },
    });
    if (error) return null;
    const maybe = data as {
      properties?: { email_otp?: string; action_link?: string };
    };
    return {
      emailOtp: maybe.properties?.email_otp ?? null,
      actionLink: maybe.properties?.action_link ?? null,
    };
  };

  const first = await generate();
  if (first?.emailOtp || first?.actionLink) return first;

  await svc.auth.admin.createUser({ email, email_confirm: true }).catch(() => {
    // The user can already exist if the UI request created it first.
  });

  const second = await generate();
  if (second?.emailOtp || second?.actionLink) return second;

  throw new Error("Failed to generate login OTP or magic link");
};

export const waitForWorkspaceByName = async (args: {
  name: string;
  timeoutMs?: number;
}): Promise<Database["public"]["Tables"]["workspaces"]["Row"]> => {
  const deadline = Date.now() + (args.timeoutMs ?? 60_000);
  const svc = getServiceClient();

  while (Date.now() < deadline) {
    const { data, error } = await svc
      .from("workspaces")
      .select("*")
      .eq("name", args.name)
      .maybeSingle();
    if (!error && data) return data;
    await sleep(500);
  }

  throw new Error(`Timed out waiting for workspace "${args.name}"`);
};

export const upsertActiveWorkspaceSubscription = async (
  workspaceId: string,
): Promise<void> => {
  const now = new Date();
  const { error } = await getServiceClient()
    .from("workspace_subscriptions")
    .upsert(
      {
        workspace_id: workspaceId,
        plan_id: "essential",
        billing_interval: "month",
        provider: "stripe",
        status: "active",
        current_period_started_at: now.toISOString(),
        current_period_ends_at: new Date(
          now.getTime() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        trial_started_at: null,
        trial_ends_at: null,
        trial_used_at: null,
        provider_customer_id: null,
        provider_subscription_id: null,
        updated_at: now.toISOString(),
      },
      { onConflict: "workspace_id" },
    );
  if (error) throw new Error(`Failed to seed entitlement: ${error.message}`);
};

export const upsertFreeWorkspaceSubscription = async (
  workspaceId: string,
): Promise<void> => {
  const now = new Date();
  const { error } = await getServiceClient()
    .from("workspace_subscriptions")
    .upsert(
      {
        workspace_id: workspaceId,
        plan_id: "free",
        billing_interval: "month",
        provider: "manual",
        status: "active",
        current_period_started_at: now.toISOString(),
        current_period_ends_at: new Date(
          now.getTime() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        trial_started_at: null,
        trial_ends_at: null,
        trial_used_at: null,
        provider_customer_id: null,
        provider_subscription_id: null,
        updated_at: now.toISOString(),
      },
      { onConflict: "workspace_id" },
    );
  if (error)
    throw new Error(`Failed to seed free entitlement: ${error.message}`);
};

export const expireWorkspaceSubscription = async (
  workspaceId: string,
): Promise<void> => {
  const { error } = await getServiceClient()
    .from("workspace_subscriptions")
    .update({
      status: "canceled",
      current_period_ends_at: new Date(Date.now() - 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(`Failed to expire entitlement: ${error.message}`);
};

export const upsertWorkspaceStorageUsage = async (args: {
  workspaceId: string;
  storageUsedBytes: number;
  day?: string;
}): Promise<void> => {
  const day = args.day ?? new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const svc = getServiceClient();

  const { error: currentError } = await svc
    .from("workspace_storage_current")
    .upsert(
      {
        workspace_id: args.workspaceId,
        storage_used_bytes: args.storageUsedBytes,
        updated_at: now,
      },
      { onConflict: "workspace_id" },
    );
  if (currentError) {
    throw new Error(
      `Failed to seed workspace_storage_current: ${currentError.message}`,
    );
  }

  const { error: dailyError } = await svc
    .from("workspace_storage_daily")
    .upsert(
      {
        workspace_id: args.workspaceId,
        day,
        storage_used_bytes: args.storageUsedBytes,
        updated_at: now,
      },
      { onConflict: "workspace_id,day" },
    );
  if (dailyError) {
    throw new Error(
      `Failed to seed workspace_storage_daily: ${dailyError.message}`,
    );
  }
};

export const upsertWorkspacePublicBandwidthUsage = async (args: {
  workspaceId: string;
  bytesServed: number;
  downloadsCount?: number;
  r2ClassAOps?: number;
  r2ClassBOps?: number;
  day?: string;
}): Promise<void> => {
  const day = args.day ?? new Date().toISOString().slice(0, 10);
  const { error } = await getServiceClient()
    .from("workspace_bandwidth_daily")
    .upsert(
      {
        workspace_id: args.workspaceId,
        day,
        bytes_served: args.bytesServed,
        downloads_count: args.downloadsCount ?? 0,
        r2_class_a_ops: args.r2ClassAOps ?? 0,
        r2_class_b_ops: args.r2ClassBOps ?? 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,day" },
    );
  if (error) {
    throw new Error(
      `Failed to seed workspace_bandwidth_daily: ${error.message}`,
    );
  }
};

export const getWorkspaceStorageUsage = async (
  workspaceId: string,
): Promise<WorkspaceStorageCurrentRow | null> => {
  const { data, error } = await getServiceClient()
    .from("workspace_storage_current")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read workspace storage usage: ${error.message}`);
  }
  return data;
};

export const getWorkspacePublicBandwidthUsage = async (args: {
  workspaceId: string;
  day?: string;
}): Promise<WorkspaceBandwidthDailyRow | null> => {
  const day = args.day ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await getServiceClient()
    .from("workspace_bandwidth_daily")
    .select("*")
    .eq("workspace_id", args.workspaceId)
    .eq("day", day)
    .maybeSingle();
  if (error) {
    throw new Error(
      `Failed to read workspace bandwidth usage: ${error.message}`,
    );
  }
  return data;
};

export const getWorkspaceSubscription = async (
  workspaceId: string,
): Promise<WorkspaceSubscriptionRow | null> => {
  const { data, error } = await getServiceClient()
    .from("workspace_subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) {
    throw new Error(
      `Failed to read workspace subscription row: ${error.message}`,
    );
  }
  return data;
};

export const countWorkspaceDocuments = async (
  workspaceId: string,
): Promise<number> => {
  const { count, error } = await getServiceClient()
    .from("documents")
    .select("id", { head: true, count: "exact" })
    .eq("workspace_id", workspaceId);
  if (error) {
    throw new Error(`Failed to count workspace documents: ${error.message}`);
  }
  return count ?? 0;
};

export const waitForDocumentByTitle = async (args: {
  workspaceId: string;
  title: string;
  dataRoomId?: string | null;
  timeoutMs?: number;
}): Promise<DocumentRow> => {
  const deadline = Date.now() + (args.timeoutMs ?? 60_000);
  const svc = getServiceClient();

  while (Date.now() < deadline) {
    let query = svc
      .from("documents")
      .select("*")
      .eq("workspace_id", args.workspaceId)
      .eq("title", args.title)
      .order("created_at", { ascending: false })
      .limit(1);

    if (args.dataRoomId !== undefined) {
      query =
        args.dataRoomId === null
          ? query.is("data_room_id", null)
          : query.eq("data_room_id", args.dataRoomId);
    }

    const { data, error } = await query;
    if (!error && data?.[0]) return data[0];
    await sleep(500);
  }

  throw new Error(`Timed out waiting for document "${args.title}"`);
};

export const waitForDocumentConversionStatus = async (args: {
  documentId: string;
  workspaceId: string;
  conversionStatus: string;
  timeoutMs?: number;
}): Promise<DocumentRow> => {
  const deadline = Date.now() + (args.timeoutMs ?? 60_000);
  const svc = getServiceClient();

  while (Date.now() < deadline) {
    const { data, error } = await svc
      .from("documents")
      .select("*")
      .eq("id", args.documentId)
      .eq("workspace_id", args.workspaceId)
      .maybeSingle();
    if (!error && data?.conversion_status === args.conversionStatus) {
      return data;
    }
    await sleep(500);
  }

  throw new Error(
    `Timed out waiting for document ${args.documentId} to become ${args.conversionStatus}`,
  );
};

export const setDocumentPageCount = async (args: {
  documentId: string;
  workspaceId: string;
  numPages: number | null;
}): Promise<void> => {
  const { error } = await getServiceClient()
    .from("documents")
    .update({ num_pages: args.numPages })
    .eq("id", args.documentId)
    .eq("workspace_id", args.workspaceId);
  if (error) {
    throw new Error(`Failed to set document page count: ${error.message}`);
  }
};

export const insertDocumentFixture = async (args: {
  id?: string;
  workspaceId: string;
  createdBy: string;
  title: string;
  storagePath: string;
  convertedStoragePath?: string | null;
  conversionClaimId?: string | null;
  folderId?: string | null;
  dataRoomId?: string | null;
}): Promise<DocumentRow> => {
  const { data, error } = await getServiceClient()
    .from("documents")
    .insert({
      id: args.id,
      workspace_id: args.workspaceId,
      created_by: args.createdBy,
      title: args.title,
      file_type: "pdf",
      size_bytes: 64,
      storage_path: args.storagePath,
      converted_storage_path: args.convertedStoragePath ?? null,
      conversion_status: args.conversionClaimId ? "in_progress" : "completed",
      conversion_claim_id: args.conversionClaimId ?? null,
      folder_id: args.folderId ?? null,
      data_room_id: args.dataRoomId ?? null,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to insert document fixture: ${error?.message}`);
  }
  return data;
};

export const insertDocumentVersionFixture = async (args: {
  workspaceId: string;
  documentId: string;
  createdBy: string;
  title: string;
  storagePath: string;
  convertedStoragePath?: string | null;
  state?: "available" | "pruned";
  sourceFolderId?: string | null;
  sourceDataRoomId?: string | null;
}): Promise<DocumentVersionRow> => {
  const state = args.state ?? "available";
  const { data, error } = await getServiceClient()
    .from("document_versions")
    .insert({
      workspace_id: args.workspaceId,
      document_id: args.documentId,
      created_by: args.createdBy,
      title: args.title,
      file_type: "pdf",
      size_bytes: 64,
      storage_path: args.storagePath,
      converted_storage_path: args.convertedStoragePath ?? null,
      conversion_status: args.convertedStoragePath ? "completed" : "none",
      state,
      counts_towards_storage: false,
      is_free_included: false,
      source_folder_id: args.sourceFolderId ?? null,
      source_scope_data_room_id: args.sourceDataRoomId ?? null,
      pruned_at: state === "pruned" ? new Date().toISOString() : null,
      pruned_reason: state === "pruned" ? "manual_cleanup" : null,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to insert version fixture: ${error?.message}`);
  }
  return data;
};

export const insertNdaSignatureFixture = async (args: {
  workspaceId: string;
  documentId: string;
  signedPdfPath: string;
}): Promise<NdaSignatureRow> => {
  const { data, error } = await getServiceClient()
    .from("nda_signatures")
    .insert({
      workspace_id: args.workspaceId,
      document_id: args.documentId,
      email: `lifecycle-${args.documentId}@example.com`,
      full_name: "Document Lifecycle Viewer",
      signed_pdf_path: args.signedPdfPath,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to insert NDA fixture: ${error?.message}`);
  }
  return data;
};

export const waitForLinkByCustomSlug = async (args: {
  workspaceId: string;
  documentId: string;
  customSlug: string;
  timeoutMs?: number;
}): Promise<LinkRow> => {
  const deadline = Date.now() + (args.timeoutMs ?? 30_000);
  const svc = getServiceClient();

  while (Date.now() < deadline) {
    const { data, error } = await svc
      .from("links")
      .select("*")
      .eq("workspace_id", args.workspaceId)
      .eq("document_id", args.documentId)
      .eq("custom_slug", args.customSlug)
      .maybeSingle();
    if (!error && data) return data;
    await sleep(500);
  }

  throw new Error(`Timed out waiting for custom slug "${args.customSlug}"`);
};

export const countDocumentLifecycleRows = async (args: {
  documentIds: string[];
  folderIds?: string[];
}): Promise<{
  documents: number;
  folders: number;
  versions: number;
  ndaSignatures: number;
}> => {
  const svc = getServiceClient();
  const folderIds = args.folderIds ?? [];

  const documentCount = async (): Promise<number> => {
    if (args.documentIds.length === 0) return 0;
    const { count, error } = await svc
      .from("documents")
      .select("id", { head: true, count: "exact" })
      .in("id", args.documentIds);
    if (error) throw new Error(`Failed to count documents: ${error.message}`);
    return count ?? 0;
  };
  const folderCount = async (): Promise<number> => {
    if (folderIds.length === 0) return 0;
    const { count, error } = await svc
      .from("folders")
      .select("id", { head: true, count: "exact" })
      .in("id", folderIds);
    if (error) throw new Error(`Failed to count folders: ${error.message}`);
    return count ?? 0;
  };
  const versionCount = async (): Promise<number> => {
    if (args.documentIds.length === 0) return 0;
    const { count, error } = await svc
      .from("document_versions")
      .select("id", { head: true, count: "exact" })
      .in("document_id", args.documentIds);
    if (error) throw new Error(`Failed to count versions: ${error.message}`);
    return count ?? 0;
  };
  const ndaCount = async (): Promise<number> => {
    if (args.documentIds.length === 0) return 0;
    const { count, error } = await svc
      .from("nda_signatures")
      .select("id", { head: true, count: "exact" })
      .in("document_id", args.documentIds);
    if (error) {
      throw new Error(`Failed to count NDA signatures: ${error.message}`);
    }
    return count ?? 0;
  };

  const [documents, folders, versions, ndaSignatures] = await Promise.all([
    documentCount(),
    folderCount(),
    versionCount(),
    ndaCount(),
  ]);
  return { documents, folders, versions, ndaSignatures };
};

export const setDocumentConversionState = async (args: {
  documentId: string;
  workspaceId: string;
  convertedStoragePath: string | null;
  conversionStatus: string;
  conversionClaimId?: string | null;
  updatedAt?: string;
}): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from("documents")
    .update({
      converted_storage_path: args.convertedStoragePath,
      conversion_status: args.conversionStatus,
      conversion_claim_id: args.conversionClaimId ?? null,
      updated_at: args.updatedAt ?? new Date().toISOString(),
    })
    .eq("id", args.documentId)
    .eq("workspace_id", args.workspaceId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    throw new Error(`Failed to update document conversion: ${error?.message}`);
  }
};

export const waitForPreviousVersion = async (documentId: string) => {
  const deadline = Date.now() + 60_000;
  const svc = getServiceClient();

  while (Date.now() < deadline) {
    const { data, error } = await svc
      .from("document_versions")
      .select("*")
      .eq("document_id", documentId)
      .order("replaced_at", { ascending: false })
      .limit(1);
    if (!error && data?.[0]) return data[0];
    await sleep(500);
  }

  throw new Error("Timed out waiting for previous document version");
};

export const insertDataRoom = async (args: {
  workspaceId: string;
  userId: string;
  name: string;
}): Promise<DataRoomRow> => {
  const { data, error } = await getServiceClient()
    .from("data_rooms")
    .insert({
      workspace_id: args.workspaceId,
      created_by: args.userId,
      name: args.name,
      description: "Core flow test room",
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to create data room: ${error?.message}`);
  }
  return data;
};

export const insertFolder = async (args: {
  workspaceId: string;
  userId: string;
  name: string;
  parentFolderId?: string | null;
  dataRoomId?: string | null;
}): Promise<FolderRow> => {
  const { data, error } = await getServiceClient()
    .from("folders")
    .insert({
      workspace_id: args.workspaceId,
      created_by: args.userId,
      name: args.name,
      parent_folder_id: args.parentFolderId ?? null,
      data_room_id: args.dataRoomId ?? null,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to insert folder: ${error?.message}`);
  }
  return data;
};

export const insertLink = async (
  link: Database["public"]["Tables"]["links"]["Insert"],
): Promise<LinkRow> => {
  const { data, error } = await getServiceClient()
    .from("links")
    .insert(link)
    .select("*")
    .single();
  if (error || !data)
    throw new Error(`Failed to insert link: ${error?.message}`);
  return data;
};

export const revokeLink = async (linkId: string): Promise<void> => {
  const { error } = await getServiceClient()
    .from("links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId);
  if (error) throw new Error(`Failed to revoke link: ${error.message}`);
};

export const addAllowedEmail = async (args: {
  workspaceId: string;
  linkId: string;
  email: string;
  userId: string;
}): Promise<void> => {
  const { error } = await getServiceClient()
    .from("link_allowed_emails")
    .insert({
      workspace_id: args.workspaceId,
      link_id: args.linkId,
      email: args.email,
      created_by: args.userId,
    });
  if (error) throw new Error(`Failed to seed allowlist: ${error.message}`);
};

export const insertNdaTemplate = async (args: {
  workspaceId: string;
  userId: string;
}): Promise<Database["public"]["Tables"]["nda_templates"]["Row"]> => {
  const body =
    "<h1>Mutual Confidentiality Agreement</h1><p>The viewer agrees to keep shared materials confidential.</p>";
  const { data, error } = await getServiceClient()
    .from("nda_templates")
    .insert({
      workspace_id: args.workspaceId,
      created_by: args.userId,
      name: `Core NDA ${Date.now()}`,
      body_html: body,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to seed NDA: ${error?.message}`);
  return data;
};

export const insertWatermark = async (
  workspaceId: string,
  options: { text?: string } = {},
): Promise<string> => {
  // Must match WatermarkTemplateDefinition (src/lib/watermarks.ts):
  // materializeWatermark returns null for unknown shapes, and the download
  // route then silently serves the PDF unwatermarked.
  const definition: Json = {
    type: "text",
    text: options.text ?? "CONFIDENTIAL",
    pattern: "diagonal_grid",
    fontSize: 1.6,
    opacity: 0.35,
    color: "#4B5563",
    rotationDeg: -30,
    xSpacing: 320,
    ySpacing: 320,
  };
  const { data, error } = await getServiceClient()
    .from("watermarks")
    .insert({
      workspace_id: workspaceId,
      name: `Core Watermark ${Date.now()}`,
      definition,
      is_default: true,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to seed watermark: ${error?.message}`);
  }
  return data.id;
};

export const invalidateWatermark = async (
  watermarkId: string,
): Promise<void> => {
  const { error } = await getServiceClient()
    .from("watermarks")
    .update({ definition: { type: "text", text: "" } })
    .eq("id", watermarkId);
  if (error) {
    throw new Error(`Failed to invalidate watermark: ${error.message}`);
  }
};

export const upsertBranding = async (args: {
  workspaceId: string;
  companyName: string;
}): Promise<void> => {
  const { error } = await getServiceClient().from("branding").upsert(
    {
      workspace_id: args.workspaceId,
      company_name: args.companyName,
      watermark_title: "CONFIDENTIAL",
      watermark_color: "#4B5563",
      watermark_font_size: 1.2,
      watermark_opacity: 0.65,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id" },
  );
  if (error) throw new Error(`Failed to seed branding: ${error.message}`);
};

export const addRestrictedMember = async (args: {
  workspaceId: string;
  email: string;
  documentsAccess?: "none" | "viewer" | "editor";
  dataRoomsAccessAll?: "none" | "viewer" | "editor";
}): Promise<{ userId: string }> => {
  const { data, error } = await getServiceClient().auth.admin.createUser({
    email: args.email,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create restricted user: ${error?.message}`);
  }

  const { error: profileError } = await getServiceClient()
    .from("profiles")
    .upsert({
      id: data.user.id,
      full_name: "Restricted Core Member",
      primary_use_case: "secure_sharing",
    });
  if (profileError) {
    throw new Error(
      `Failed to add restricted profile: ${profileError.message}`,
    );
  }

  const { error: memberError } = await getServiceClient()
    .from("workspace_members")
    .upsert({
      workspace_id: args.workspaceId,
      user_id: data.user.id,
      documents_access: args.documentsAccess ?? "none",
      data_rooms_access_all: args.dataRoomsAccessAll ?? "none",
    });
  if (memberError) {
    throw new Error(`Failed to add restricted member: ${memberError.message}`);
  }

  return { userId: data.user.id };
};

export const createAuthUserForEmail = async (args: {
  email: string;
  fullName?: string;
}): Promise<string> => {
  const normalizedEmail = args.email.trim().toLowerCase();
  const svc = getServiceClient();
  const { data, error } = await svc.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
  });

  if (!error && data.user) {
    await svc.from("profiles").upsert({
      id: data.user.id,
      full_name: args.fullName ?? "Free Plan Guardrail User",
      primary_use_case: "secure_sharing",
    });
    return data.user.id;
  }

  if (error?.message?.toLowerCase().includes("already")) {
    return await getAuthUserIdByEmail(normalizedEmail);
  }

  throw new Error(`Failed to create auth user: ${error?.message}`);
};

const toMutationFailure = (error: {
  code?: string | null;
  message?: string | null;
}): MutationFailure => ({
  code: error.code ?? null,
  message: error.message ?? "Unknown database mutation error",
});

export const tryInsertWorkspaceMemberDirect = async (args: {
  workspaceId: string;
  userId: string;
}): Promise<MutationFailure | null> => {
  const { error } = await getServiceClient().from("workspace_members").insert({
    workspace_id: args.workspaceId,
    user_id: args.userId,
    documents_access: "none",
    data_rooms_access_all: "none",
  });

  return error ? toMutationFailure(error) : null;
};

export const tryInsertWorkspaceInviteDirect = async (args: {
  workspaceId: string;
  email: string;
  invitedBy: string;
}): Promise<MutationFailure | null> => {
  const { error } = await getServiceClient().from("workspace_invites").insert({
    workspace_id: args.workspaceId,
    email: args.email.trim().toLowerCase(),
    invited_by: args.invitedBy,
    documents_access: "none",
    data_rooms_access_all: "none",
  });

  return error ? toMutationFailure(error) : null;
};

export const tryInsertDocumentDirect = async (args: {
  workspaceId: string;
  createdBy: string;
  title: string;
  fileType: string;
  sizeBytes: number;
  storagePath: string;
}): Promise<MutationFailure | null> => {
  const { error } = await getServiceClient().from("documents").insert({
    workspace_id: args.workspaceId,
    created_by: args.createdBy,
    title: args.title,
    file_type: args.fileType,
    storage_path: args.storagePath,
    size_bytes: args.sizeBytes,
  });

  return error ? toMutationFailure(error) : null;
};

export const tryInsertDocumentVersionDirect = async (args: {
  workspaceId: string;
  documentId: string;
  createdBy: string;
  title: string;
  fileType: string;
  sizeBytes: number;
  storagePath: string;
  state?: "available" | "pruned";
}): Promise<MutationFailure | null> => {
  const { error } = await getServiceClient()
    .from("document_versions")
    .insert({
      workspace_id: args.workspaceId,
      document_id: args.documentId,
      created_by: args.createdBy,
      title: args.title,
      file_type: args.fileType,
      storage_path: args.storagePath,
      size_bytes: args.sizeBytes,
      conversion_status: "none",
      state: args.state ?? "available",
      counts_towards_storage: true,
      is_free_included: false,
    });

  return error ? toMutationFailure(error) : null;
};

const RAW_IP_KEY_PATTERN = /(^|_)ip(_|$)|ip_address|remote_addr|client_addr/;
const IPV4_VALUE_PATTERN = /\b\d{1,3}(\.\d{1,3}){3}\b/;
// Require 3+ consecutive "hextet:" groups or a "::" compression so ISO
// timestamps ("10:30:00") never match.
const IPV6_VALUE_PATTERN = /(?:[0-9a-f]{1,4}:){3,}[0-9a-f]{1,4}|::/i;

// Asserts the AGENTS.md "do not store raw IP addresses" invariant on an
// analytics row: no IP-named column and no IP-shaped string value.
export const findRawIpViolations = (row: Record<string, unknown>): string[] => {
  const violations: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (RAW_IP_KEY_PATTERN.test(key.toLowerCase())) {
      violations.push(`column "${key}" looks like a raw IP field`);
    }
    if (
      typeof value === "string" &&
      (IPV4_VALUE_PATTERN.test(value) || IPV6_VALUE_PATTERN.test(value))
    ) {
      violations.push(`column "${key}" contains an IP-shaped value`);
    }
  }
  return violations;
};

export const waitForViewerAnalytics = async (args: {
  workspaceId: string;
  linkId: string;
  viewerEmail?: string | null;
  timeoutMs?: number;
}) => {
  const deadline = Date.now() + (args.timeoutMs ?? 60_000);
  const svc = getServiceClient();

  while (Date.now() < deadline) {
    let query = svc
      .from("analytics_v2_resource_viewers_daily")
      .select("*")
      .eq("workspace_id", args.workspaceId)
      .eq("link_id", args.linkId)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (args.viewerEmail === null) {
      query = query.is("viewer_email", null);
    } else if (args.viewerEmail) {
      query = query.eq("viewer_email", args.viewerEmail);
    }

    const { data, error } = await query;
    if (!error && data?.[0]) return data[0];
    await sleep(1000);
  }

  throw new Error("Timed out waiting for viewer analytics");
};

export const waitForFeedback = async (linkId: string) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const { data, error } = await getServiceClient()
      .from("feedback")
      .select("id, submission")
      .eq("link_id", linkId)
      .limit(1);
    if (!error && data?.[0]) return data[0];
    await sleep(500);
  }
  throw new Error("Timed out waiting for feedback row");
};

export const waitForQa = async (linkId: string) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const { data, error } = await getServiceClient()
      .from("qas")
      .select("id")
      .eq("link_id", linkId)
      .limit(1);
    if (!error && data?.[0]) return data[0];
    await sleep(500);
  }
  throw new Error("Timed out waiting for Q&A row");
};

export const waitForNdaSignature = async (args: {
  linkId: string;
  email: string;
  documentId: string;
  timeoutMs?: number;
}): Promise<NdaSignatureRow> => {
  const deadline = Date.now() + (args.timeoutMs ?? 60_000);
  const svc = getServiceClient();
  const normalizedEmail = args.email.trim().toLowerCase();

  while (Date.now() < deadline) {
    const { data, error } = await svc
      .from("nda_signatures")
      .select("*")
      .eq("link_id", args.linkId)
      .eq("document_id", args.documentId)
      .eq("email", normalizedEmail)
      .not("signed_pdf_path", "is", null)
      .order("signed_at", { ascending: false })
      .limit(1);

    if (!error && data?.[0]) return data[0];
    await sleep(500);
  }

  throw new Error("Timed out waiting for signed NDA signature");
};
