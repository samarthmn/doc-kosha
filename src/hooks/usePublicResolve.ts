"use client";

import { useCallback } from "react";

export type QAPair = {
  question: string;
  answer: string;
};

export type BrandingHeader = {
  company_name: string | null;
  website_url: string | null;
  logo_signed_url: string | null;
  logo_data_url?: string | null;
  domain: string | null;
  domain_verified: boolean;
  show_powered_by: boolean;
} | null;

export type PublicDataRoomFolder = {
  id: string;
  name: string;
  parent_folder_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PublicDataRoomDocument = {
  id: string;
  title: string | null;
  file_type: string | null;
  num_pages: number | null;
  storage_path: string | null;
  converted_storage_path: string | null;
  conversion_status: string | null;
  size_bytes: number | null;
  folder_id: string | null;
  workspace_id: string | null;
  data_room_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type DocumentResolveResult = {
  ok: true;
  kind: "document";
  link: {
    can_download: boolean;
    apply_watermark: boolean;
    dynamic_watermark_variables: boolean;
    email_verification: boolean;
    screenshot_protection: boolean;
    expires_at: string | null;
    show_qas: boolean;
    curated_qas: QAPair[];
    show_feedback: boolean;
    email_notify: boolean;
    comments_enabled: boolean;
    nda_gate: boolean;
    /** Pinned custom NDA body HTML snapshot used for NDA signing */
    nda_template_snapshot_html: string | null;
    public_language: string;
  };
  document: {
    id: string;
    title: string | null;
    file_type: string | null;
    num_pages: number | null;
    storage_path: string | null;
    converted_storage_path: string | null;
    conversion_status?: string | null;
  };
  workspace_name: string;
  workspace_id: string;
  verified_email: string | null;
  branding_header: BrandingHeader;
  public_language: string;
};

export type DataRoomResolveResult = {
  ok: true;
  kind: "data_room";
  link: DocumentResolveResult["link"];
  room: {
    id: string;
    name: string | null;
    description: string | null;
    status: string | null;
    workspace_id: string;
    created_at: string | null;
    updated_at: string | null;
  };
  folders: PublicDataRoomFolder[];
  documents: PublicDataRoomDocument[];
  workspace_name: string;
  workspace_id: string;
  verified_email: string | null;
  branding_header: BrandingHeader;
  public_language: string;
};

type ResolveResult = DocumentResolveResult | DataRoomResolveResult;

type ResolveArgs = {
  linkId: string;
  documentId?: string;
  dataRoomId?: string;
  password?: string;
};

type ResolveErrorPayload = {
  code?: unknown;
  error?: unknown;
  workspace_name?: unknown;
  workspace_id?: unknown;
  verified_email?: unknown;
  nda_template_snapshot_html?: unknown;
  public_language?: unknown;
};

type PublicResolveError = Error & {
  workspaceName?: string;
  workspaceId?: string;
  verifiedEmail?: string | null;
  ndaTemplateSnapshotHtml?: string | null;
  publicLanguage?: string;
};

export const usePublicResolve = () => {
  const resolve = useCallback(
    async (args: ResolveArgs): Promise<ResolveResult> => {
      const res = await fetch("/api/public/links/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          linkId: args.linkId,
          documentId: args.documentId,
          dataRoomId: args.dataRoomId,
          password: args.password,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as ResolveErrorPayload;
        const code =
          typeof err.code === "string"
            ? err.code
            : typeof err.error === "string"
              ? err.error
              : null;
        const resolveError = new Error(code || "UNKNOWN") as PublicResolveError;
        if (typeof err.workspace_name === "string") {
          resolveError.workspaceName = err.workspace_name;
        }
        if (typeof err.workspace_id === "string") {
          resolveError.workspaceId = err.workspace_id;
        }
        if (typeof err.verified_email === "string") {
          resolveError.verifiedEmail = err.verified_email;
        } else if (err.verified_email === null) {
          resolveError.verifiedEmail = null;
        }
        if (typeof err.public_language === "string") {
          resolveError.publicLanguage = err.public_language;
        }
        if (typeof err.nda_template_snapshot_html === "string") {
          resolveError.ndaTemplateSnapshotHtml = err.nda_template_snapshot_html;
        } else if (err.nda_template_snapshot_html === null) {
          resolveError.ndaTemplateSnapshotHtml = null;
        }
        throw resolveError;
      }

      const data = await res.json();
      if (data.document) {
        return {
          ok: true,
          kind: "document",
          link: {
            can_download: data.link.can_download,
            apply_watermark: data.link.apply_watermark,
            dynamic_watermark_variables: data.link.dynamic_watermark_variables,
            email_verification: data.link.email_verification,
            screenshot_protection: data.link.screenshot_protection,
            expires_at: data.link.expires_at,
            show_qas: data.link.show_qas,
            curated_qas: data.link.curated_qas || [],
            show_feedback: data.link.show_feedback,
            email_notify: data.link.email_notify,
            comments_enabled: Boolean(data.link.comments_enabled),
            nda_gate: Boolean(data.link.nda_gate),
            nda_template_snapshot_html:
              data.link.nda_template_snapshot_html ?? null,
            public_language: data.link.public_language ?? "en",
          },
          document: {
            id: data.document.id,
            title: data.document.title,
            file_type: data.document.file_type,
            num_pages: data.document.num_pages,
            storage_path: data.document.storage_path,
            converted_storage_path: data.document.converted_storage_path,
            conversion_status: data.document.conversion_status,
          },
          workspace_name: data.workspace_name,
          workspace_id: data.workspace_id,
          verified_email: data.verified_email,
          branding_header: data.branding_header ?? null,
          public_language:
            data.public_language ?? data.link.public_language ?? "en",
        };
      }

      return {
        ok: true,
        kind: "data_room",
        link: {
          can_download: data.link.can_download,
          apply_watermark: data.link.apply_watermark,
          dynamic_watermark_variables: data.link.dynamic_watermark_variables,
          email_verification: data.link.email_verification,
          screenshot_protection: data.link.screenshot_protection,
          expires_at: data.link.expires_at,
          show_qas: data.link.show_qas,
          curated_qas: data.link.curated_qas || [],
          show_feedback: data.link.show_feedback,
          email_notify: data.link.email_notify,
          comments_enabled: Boolean(data.link.comments_enabled),
          nda_gate: Boolean(data.link.nda_gate),
          nda_template_snapshot_html:
            data.link.nda_template_snapshot_html ?? null,
          public_language: data.link.public_language ?? "en",
        },
        room: {
          id: data.room.id,
          name: data.room.name,
          description: data.room.description,
          status: data.room.status,
          workspace_id: data.room.workspace_id,
          created_at: data.room.created_at,
          updated_at: data.room.updated_at,
        },
        folders: Array.isArray(data.folders) ? data.folders : [],
        documents: Array.isArray(data.documents) ? data.documents : [],
        workspace_name: data.workspace_name,
        workspace_id: data.workspace_id,
        verified_email: data.verified_email,
        branding_header: data.branding_header ?? null,
        public_language:
          data.public_language ?? data.link.public_language ?? "en",
      };
    },
    [],
  );

  return { resolve };
};
