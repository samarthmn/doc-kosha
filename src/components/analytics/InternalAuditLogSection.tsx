"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow, isValid } from "date-fns";
import {
  ArrowClockwise,
  CaretDown,
  ChatCircle,
  DownloadSimple,
  Eye,
  FileText,
  FolderOpen,
  Link as LinkIcon,
  Pulse,
  Shield,
  Trash,
  User,
  Users,
} from "@phosphor-icons/react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type AuditEventRow = {
  id: string;
  actor_name: string | null;
  actor_email: string | null;
  event_type: string;
  resource_type: string;
  resource_id: string | null;
  data_room_id: string | null;
  document_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type LinkNameRow = { id: string; name: string | null };
type GroupNameRow = { id: string; name: string };
type DocumentTitleRow = { id: string; title: string | null };
type DataRoomNameRow = { id: string; name: string | null };

type InternalAuditLogSectionProps = {
  workspaceId: string;
  documentId?: string | null;
  dataRoomId?: string | null;
  className?: string;
};

const EVENT_LABELS: Record<string, string> = {
  document_viewed: "Viewed document",
  document_downloaded: "Downloaded document",
  data_room_opened: "Opened data room",
  data_room_zip_downloaded: "Downloaded data room ZIP",
  comment_thread_created: "Created comment thread",
  comment_reply_sent: "Replied to comment thread",
  comment_thread_resolved: "Resolved comment thread",
  comment_thread_unresolved: "Reopened comment thread",
};

const formatEventLabel = (eventType: string, resourceType: string): string => {
  const normalizedType = eventType.toLowerCase();
  const normalizedResource = resourceType.toLowerCase();

  if (normalizedResource === "documents") {
    if (normalizedType === "insert") return "Uploaded document";
    if (normalizedType === "update") return "Renamed document";
    if (normalizedType === "delete") return "Deleted document";
  }

  if (normalizedResource === "data_rooms") {
    if (normalizedType === "insert") return "Created data room";
  }

  if (normalizedResource === "data_room_documents") {
    if (normalizedType === "insert") return "Uploaded document";
    if (normalizedType === "delete") return "Deleted document";
  }

  if (normalizedResource === "folders") {
    if (normalizedType === "insert") return "Created folder";
    if (normalizedType === "update") return "Renamed folder";
    if (normalizedType === "delete") return "Deleted folder";
  }

  if (normalizedResource === "links") {
    if (normalizedType === "insert") return "Created link";
    if (normalizedType === "update") return "Updated link";
    if (normalizedType === "delete") return "Deleted link";
  }

  if (normalizedResource === "data_room_members") {
    if (normalizedType === "insert") return "Granted access";
    if (normalizedType === "delete") return "Revoked access";
  }

  const known = EVENT_LABELS[normalizedType];
  if (known) return known;

  if (
    normalizedType === "insert" ||
    normalizedType === "update" ||
    normalizedType === "delete"
  ) {
    const resource = resourceType
      ? resourceType.replace(/_/g, " ").replace(/s$/, "")
      : "";
    const verb =
      normalizedType === "insert"
        ? "Created"
        : normalizedType === "update"
          ? "Updated"
          : "Deleted";
    return resource ? `${verb} ${resource}` : verb;
  }

  const resource = resourceType ? resourceType.replace(/_/g, " ") : "resource";
  return `${resource} ${normalizedType.replace(/_/g, " ")}`;
};

type TriggerAuditMetadata = {
  table?: string;
  operation?: string;
  new?: unknown;
  old?: unknown;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getTriggerMetadata = (metadata: unknown): TriggerAuditMetadata | null => {
  if (!isPlainObject(metadata)) return null;
  if (!("table" in metadata) && !("operation" in metadata)) return null;
  return metadata as TriggerAuditMetadata;
};

type Scalar = string | number | boolean | null;

const isScalar = (value: unknown): value is Scalar =>
  value === null ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const toScalarLabel = (value: Scalar): string => {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
};

const formatToggle = (value: Scalar): string => {
  if (typeof value !== "boolean") return toScalarLabel(value);
  return value ? "Enabled" : "Disabled";
};

const formatMaybeDateTime = (value: Scalar): string => {
  if (!value) return "Never";
  if (typeof value !== "string") return toScalarLabel(value);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
};

const getScalar = (obj: unknown, key: string): Scalar | undefined => {
  if (!isPlainObject(obj)) return undefined;
  const value = obj[key];
  if (!isScalar(value)) return undefined;
  return value;
};

const getString = (obj: unknown, key: string): string | null => {
  if (!isPlainObject(obj)) return null;
  const value = obj[key];
  return typeof value === "string" ? value : null;
};

const getLinkIdFromTrigger = (
  metadata: TriggerAuditMetadata | null,
): string | null => {
  if (!metadata) return null;
  const fromNew = getString(metadata.new, "link_id");
  const fromOld = getString(metadata.old, "link_id");
  const fromId =
    metadata.table === "links"
      ? (getString(metadata.new, "id") ?? getString(metadata.old, "id"))
      : null;
  return fromNew ?? fromOld ?? fromId ?? null;
};

const getLinkIdFromEventMetadata = (metadata: unknown): string | null => {
  if (!isPlainObject(metadata)) return null;
  const value = metadata.link_id;
  return typeof value === "string" && value ? value : null;
};

const getGroupIdFromTrigger = (
  metadata: TriggerAuditMetadata | null,
): string | null => {
  if (!metadata) return null;
  return (
    getString(metadata.new, "group_id") ?? getString(metadata.old, "group_id")
  );
};

const buildScalarDiff = (
  before: unknown,
  after: unknown,
): Array<{ key: string; from: Scalar; to: Scalar }> => {
  if (!isPlainObject(before) || !isPlainObject(after)) return [];
  const ignore = new Set([
    "updated_at",
    "created_at",
    "last_accessed_at",
    "workspace_id",
    "id",
  ]);

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: Array<{ key: string; from: Scalar; to: Scalar }> = [];
  for (const key of keys) {
    if (ignore.has(key)) continue;
    const fromVal = before[key];
    const toVal = after[key];
    if (!isScalar(fromVal) || !isScalar(toVal)) continue;
    if (fromVal === toVal) continue;
    changes.push({ key, from: fromVal, to: toVal });
  }

  return changes.sort((a, b) => a.key.localeCompare(b.key));
};

const getResourceLabel = (
  metadata: TriggerAuditMetadata | null,
): string | null => {
  if (!metadata) return null;
  const candidate =
    (isPlainObject(metadata.new) ? metadata.new : null) ??
    (isPlainObject(metadata.old) ? metadata.old : null);
  if (!candidate) return null;
  const name =
    (typeof candidate.name === "string" ? candidate.name : null) ??
    (typeof candidate.title === "string" ? candidate.title : null);
  if (name) return name;
  return null;
};

const normalizeAuditResourceType = (resourceType: string): string => {
  const normalized = resourceType.toLowerCase();
  if (normalized === "document") return "documents";
  if (normalized === "data_room") return "data_rooms";
  if (normalized === "link") return "links";
  return normalized;
};

type SafeDetail = { label: string; value: string };

const getAreaLabel = (params: {
  table: string | null;
  resourceType: string;
}): string => {
  const { table, resourceType } = params;
  const normalizedResourceType = normalizeAuditResourceType(resourceType);

  if (normalizedResourceType.includes("comment")) return "Comments";

  if (table) {
    if (
      table === "links" ||
      table === "link_allowed_emails" ||
      table === "link_blocked_emails" ||
      table === "link_allowed_groups" ||
      table === "link_blocked_groups"
    ) {
      return "Link sharing";
    }

    if (
      table === "workspace_user_groups" ||
      table === "workspace_user_group_emails"
    ) {
      return "User groups";
    }

    if (
      table === "link_presets" ||
      table === "link_preset_allowed_emails" ||
      table === "link_preset_blocked_emails" ||
      table === "link_preset_allowed_groups" ||
      table === "link_preset_blocked_groups"
    ) {
      return "Link presets";
    }

    if (table === "data_room_documents") return "Room contents";
    if (table === "data_room_members") return "Access";
    if (table === "documents") return "Documents";
    if (table === "data_rooms") return "Data rooms";
    if (table === "folders") return "Folders";
  }

  if (normalizedResourceType === "documents") return "Documents";
  if (normalizedResourceType === "data_rooms") return "Data rooms";
  return "Workspace";
};

const isAllowlistedAuditEventRow = (row: AuditEventRow): boolean => {
  const eventType = row.event_type.toLowerCase();
  const resourceType = row.resource_type.toLowerCase();

  if (eventType.startsWith("comment_")) return true;

  if (resourceType === "documents") {
    if (eventType === "insert" || eventType === "delete") return true;
    if (eventType !== "update") return false;
    const meta = getTriggerMetadata(row.metadata);
    const from = getString(meta?.old, "title");
    const to = getString(meta?.new, "title");
    if (from === null || to === null) return false;
    return from.trim() !== to.trim();
  }

  if (resourceType === "data_rooms") {
    return eventType === "insert";
  }

  if (resourceType === "links") {
    return (
      eventType === "insert" || eventType === "update" || eventType === "delete"
    );
  }

  if (resourceType === "data_room_documents") {
    return eventType === "insert" || eventType === "delete";
  }

  if (resourceType === "folders") {
    if (!row.data_room_id) return false;
    if (eventType === "insert" || eventType === "delete") return true;
    if (eventType !== "update") return false;
    const meta = getTriggerMetadata(row.metadata);
    const from = getString(meta?.old, "name");
    const to = getString(meta?.new, "name");
    if (from === null || to === null) return false;
    return from.trim() !== to.trim();
  }

  if (resourceType === "data_room_members") {
    return eventType === "insert" || eventType === "delete";
  }

  return false;
};

const getActionLabel = (params: {
  operation: string | null;
  eventType: string;
  resourceType: string;
}): string => {
  const { operation, eventType, resourceType } = params;
  const normalizedOperation = operation?.toLowerCase() ?? null;
  const normalizedResourceType = resourceType.toLowerCase();

  if (normalizedResourceType === "documents") {
    if (normalizedOperation === "insert") return "Uploaded";
    if (normalizedOperation === "update") return "Renamed";
    if (normalizedOperation === "delete") return "Deleted";
  }

  if (normalizedResourceType === "data_rooms") {
    if (normalizedOperation === "insert") return "Created";
  }

  if (normalizedResourceType === "data_room_documents") {
    if (normalizedOperation === "insert") return "Uploaded";
    if (normalizedOperation === "delete") return "Deleted";
  }

  if (normalizedResourceType === "folders") {
    if (normalizedOperation === "insert") return "Created";
    if (normalizedOperation === "update") return "Renamed";
    if (normalizedOperation === "delete") return "Deleted";
  }

  if (normalizedResourceType === "links") {
    if (normalizedOperation === "insert") return "Created";
    if (normalizedOperation === "update") return "Updated";
    if (normalizedOperation === "delete") return "Deleted";
  }

  if (normalizedResourceType === "data_room_members") {
    if (normalizedOperation === "insert") return "Granted access";
    if (normalizedOperation === "delete") return "Revoked access";
  }

  if (normalizedOperation === "insert") return "Created";
  if (normalizedOperation === "update") return "Updated";
  if (normalizedOperation === "delete") return "Deleted";

  const normalizedEventType = eventType.toLowerCase();
  if (EVENT_LABELS[normalizedEventType])
    return EVENT_LABELS[normalizedEventType];
  return normalizedEventType.replace(/_/g, " ");
};

const SAFE_LINK_FIELDS: Record<
  string,
  { label: string; format?: (value: Scalar) => string }
> = {
  name: { label: "Link name" },
  access: { label: "Access" },
  expires_at: { label: "Expiration", format: formatMaybeDateTime },
  can_download: { label: "Download", format: formatToggle },
  email_verification: { label: "Email verification", format: formatToggle },
  nda_gate: { label: "NDA gate", format: formatToggle },
  apply_watermark: { label: "Watermark", format: formatToggle },
  screenshot_protection: {
    label: "Screenshot protection",
    format: formatToggle,
  },
  open_once: { label: "Open once", format: formatToggle },
  email_notify: { label: "Invite emails", format: formatToggle },
  collect_email_for_analytics: {
    label: "Collect emails for analytics",
    format: formatToggle,
  },
};

const buildSafeDetails = (params: {
  event: AuditEventRow;
  triggerMetadata: TriggerAuditMetadata | null;
  linkNameById: Record<string, string>;
  groupNameById: Record<string, string>;
  documentTitleById: Record<string, string>;
  dataRoomNameById: Record<string, string>;
}): SafeDetail[] => {
  const {
    event,
    triggerMetadata,
    linkNameById,
    groupNameById,
    documentTitleById,
    dataRoomNameById,
  } = params;
  const details: SafeDetail[] = [];

  const operation = triggerMetadata?.operation
    ? String(triggerMetadata.operation).toLowerCase()
    : null;
  const table = triggerMetadata?.table ? String(triggerMetadata.table) : null;
  const normalizedResourceType = normalizeAuditResourceType(
    event.resource_type,
  );

  details.push({
    label: "Action",
    value: getActionLabel({
      operation,
      eventType: event.event_type,
      resourceType: normalizedResourceType,
    }),
  });
  details.push({
    label: "Area",
    value: getAreaLabel({ table, resourceType: normalizedResourceType }),
  });

  const resourceNameFromSnapshot = getResourceLabel(triggerMetadata);
  const resourceLabel =
    resourceNameFromSnapshot ??
    (normalizedResourceType === "documents"
      ? documentTitleById[event.document_id ?? event.resource_id ?? ""]
      : normalizedResourceType === "data_rooms"
        ? dataRoomNameById[event.data_room_id ?? event.resource_id ?? ""]
        : null);

  if (resourceLabel) {
    const label =
      normalizedResourceType === "documents"
        ? "Document"
        : normalizedResourceType === "data_rooms"
          ? "Data room"
          : "Item";
    details.push({ label, value: resourceLabel });
  }

  const linkId =
    getLinkIdFromTrigger(triggerMetadata) ??
    getLinkIdFromEventMetadata(event.metadata);
  const linkName = linkId ? linkNameById[linkId] : null;
  if (linkName) details.push({ label: "Link", value: linkName });

  const groupId = getGroupIdFromTrigger(triggerMetadata);
  const groupName = groupId ? groupNameById[groupId] : null;
  if (groupName) details.push({ label: "Group", value: groupName });

  const normalizedEventType = event.event_type.toLowerCase();
  if (normalizedEventType.startsWith("comment_")) {
    const pageNumber = getScalar(event.metadata, "page_number");
    if (typeof pageNumber === "number" && Number.isFinite(pageNumber)) {
      details.push({ label: "Page", value: String(pageNumber) });
    }

    const quote = getString(event.metadata, "quote");
    if (quote) details.push({ label: "Quote", value: quote });

    const preview = getString(event.metadata, "body_preview");
    if (preview) {
      details.push({
        label:
          normalizedEventType === "comment_reply_sent" ? "Reply" : "Comment",
        value: preview,
      });
    }
  }

  // Link created/updated/deleted: show safe diffs only (no raw column names).
  if (table === "links" && operation === "update") {
    const diff = buildScalarDiff(triggerMetadata?.old, triggerMetadata?.new);
    let hiddenCount = 0;
    for (const change of diff) {
      const safeField = SAFE_LINK_FIELDS[change.key];
      if (!safeField) {
        hiddenCount += 1;
        continue;
      }
      const formatter = safeField.format ?? toScalarLabel;
      details.push({
        label: safeField.label,
        value: `${formatter(change.from)} → ${formatter(change.to)}`,
      });
    }
    if (hiddenCount > 0) {
      details.push({ label: "Other changes", value: `${hiddenCount} hidden` });
    }
    return details;
  }

  if (table === "links" && (operation === "insert" || operation === "delete")) {
    const snapshot =
      operation === "insert" ? triggerMetadata?.new : triggerMetadata?.old;
    const name = getString(snapshot, "name");
    if (name && !linkName) details.push({ label: "Link", value: name });
    const access = getScalar(snapshot, "access");
    if (access) details.push({ label: "Access", value: toScalarLabel(access) });
    const expiresAt = getScalar(snapshot, "expires_at") ?? null;
    details.push({
      label: "Expiration",
      value: formatMaybeDateTime(expiresAt),
    });
    const canDownload = getScalar(snapshot, "can_download");
    if (typeof canDownload === "boolean") {
      details.push({ label: "Download", value: formatToggle(canDownload) });
    }
    const ndaGate = getScalar(snapshot, "nda_gate");
    if (typeof ndaGate === "boolean") {
      details.push({ label: "NDA gate", value: formatToggle(ndaGate) });
    }
    return details;
  }

  // Access rules: show semantics only.
  if (table === "link_allowed_emails") {
    const email =
      getString(triggerMetadata?.new, "email") ??
      getString(triggerMetadata?.old, "email");
    if (email) {
      details.push({
        label: "Allowed email",
        value:
          operation === "delete" ? `Removed (${email})` : `Added (${email})`,
      });
    }
    return details;
  }

  if (table === "link_blocked_emails") {
    const email =
      getString(triggerMetadata?.new, "email") ??
      getString(triggerMetadata?.old, "email");
    if (email) {
      details.push({
        label: "Blocked email",
        value:
          operation === "delete" ? `Removed (${email})` : `Added (${email})`,
      });
    }
    return details;
  }

  if (table === "workspace_user_groups") {
    const snapshot =
      operation === "insert" ? triggerMetadata?.new : triggerMetadata?.old;
    const name = getString(snapshot, "name");
    if (name) details.push({ label: "Group", value: name });
    return details;
  }

  if (table === "workspace_user_group_emails") {
    const email =
      getString(triggerMetadata?.new, "email") ??
      getString(triggerMetadata?.old, "email");
    if (email) {
      details.push({
        label: "Member email",
        value:
          operation === "delete" ? `Removed (${email})` : `Added (${email})`,
      });
    }
    return details;
  }

  if (table === "link_presets") {
    const snapshot =
      operation === "insert" ? triggerMetadata?.new : triggerMetadata?.old;
    const name = getString(snapshot, "name");
    if (name) details.push({ label: "Preset", value: name });
    return details;
  }

  if (table === "link_allowed_groups") {
    if (groupName) {
      details.push({
        label: "Allowed group",
        value:
          operation === "delete"
            ? `Removed (${groupName})`
            : `Added (${groupName})`,
      });
    } else if (groupId) {
      details.push({
        label: "Allowed group",
        value: operation === "delete" ? "Removed" : "Added",
      });
    }
    return details;
  }

  if (table === "link_blocked_groups") {
    if (groupName) {
      details.push({
        label: "Blocked group",
        value:
          operation === "delete"
            ? `Removed (${groupName})`
            : `Added (${groupName})`,
      });
    } else if (groupId) {
      details.push({
        label: "Blocked group",
        value: operation === "delete" ? "Removed" : "Added",
      });
    }
    return details;
  }

  return details;
};

const getEventIcon = (eventType: string, resourceType: string) => {
  const type = eventType.toLowerCase();
  const resource = resourceType.toLowerCase();

  if (type.startsWith("comment_") || resource.includes("comment")) {
    return <ChatCircle aria-hidden className="h-4 w-4" />;
  }

  if (type === "delete") return <Trash aria-hidden className="h-4 w-4" />;
  if (resource === "data_rooms")
    return <FolderOpen aria-hidden className="h-4 w-4" />;
  if (resource.includes("link"))
    return <LinkIcon aria-hidden className="h-4 w-4" />;
  if (resource.includes("document"))
    return <FileText aria-hidden className="h-4 w-4" />;
  if (resource.includes("folder"))
    return <FolderOpen aria-hidden className="h-4 w-4" />;
  if (resource.includes("member"))
    return <Users aria-hidden className="h-4 w-4" />;

  if (type.includes("download"))
    return <DownloadSimple aria-hidden className="h-4 w-4" />;
  if (type.includes("view")) return <Eye aria-hidden className="h-4 w-4" />;
  if (type.includes("open"))
    return <FolderOpen aria-hidden className="h-4 w-4" />;
  return <Pulse aria-hidden className="h-4 w-4" />;
};

const InternalAuditLogSection: React.FC<InternalAuditLogSectionProps> = ({
  workspaceId,
  documentId,
  dataRoomId,
  className,
}) => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [linkNameById, setLinkNameById] = useState<Record<string, string>>({});
  const [groupNameById, setGroupNameById] = useState<Record<string, string>>(
    {},
  );
  const [documentTitleById, setDocumentTitleById] = useState<
    Record<string, string>
  >({});
  const [dataRoomNameById, setDataRoomNameById] = useState<
    Record<string, string>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const detailsByEventId = useMemo(() => {
    const map: Record<string, SafeDetail[]> = {};
    for (const event of events) {
      const triggerMetadata = getTriggerMetadata(event.metadata);
      map[event.id] = buildSafeDetails({
        event,
        triggerMetadata,
        linkNameById,
        groupNameById,
        documentTitleById,
        dataRoomNameById,
      });
    }
    return map;
  }, [
    dataRoomNameById,
    documentTitleById,
    events,
    groupNameById,
    linkNameById,
  ]);

  const loadEvents = useCallback(async () => {
    if (!workspaceId) {
      setEvents([]);
      setErrorMessage(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      let query = supabase
        .from("audit_events" as never)
        .select(
          "id, actor_name, actor_email, event_type, resource_type, resource_id, data_room_id, document_id, created_at, metadata",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (documentId) {
        query = query.eq("document_id", documentId);
      }
      if (dataRoomId) {
        query = query.eq("data_room_id", dataRoomId);
      }

      const { data, error } = await query;
      if (error) {
        throw error;
      }
      const nextEvents = (data ?? []) as AuditEventRow[];
      const allowlisted = nextEvents
        .filter(isAllowlistedAuditEventRow)
        .slice(0, 60);
      setEvents(allowlisted);

      const triggerMetas = allowlisted
        .map((row) => getTriggerMetadata(row.metadata))
        .filter((meta): meta is TriggerAuditMetadata => Boolean(meta));

      const linkIds = Array.from(
        new Set(
          [
            ...triggerMetas
              .map((meta) => getLinkIdFromTrigger(meta))
              .filter((id): id is string => Boolean(id)),
            ...allowlisted
              .map((event) => getLinkIdFromEventMetadata(event.metadata))
              .filter((id): id is string => Boolean(id)),
          ].filter((id): id is string => Boolean(id)),
        ),
      );

      const groupIds = Array.from(
        new Set(
          triggerMetas
            .map((meta) => getGroupIdFromTrigger(meta))
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const documentIds = Array.from(
        new Set(
          allowlisted
            .flatMap((event) => [
              event.document_id,
              event.resource_type === "documents" ? event.resource_id : null,
            ])
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const dataRoomIds = Array.from(
        new Set(
          allowlisted
            .flatMap((event) => [
              event.data_room_id,
              event.resource_type === "data_rooms" ? event.resource_id : null,
            ])
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const [linksResult, groupsResult, documentsResult, dataRoomsResult] =
        await Promise.all([
          linkIds.length > 0
            ? supabase
                .from("links" as never)
                .select("id, name")
                .in("id", linkIds)
            : Promise.resolve({ data: [] as unknown[] }),
          groupIds.length > 0
            ? supabase
                .from("workspace_user_groups" as never)
                .select("id, name")
                .in("id", groupIds)
            : Promise.resolve({ data: [] as unknown[] }),
          documentIds.length > 0
            ? supabase
                .from("documents" as never)
                .select("id, title")
                .in("id", documentIds)
            : Promise.resolve({ data: [] as unknown[] }),
          dataRoomIds.length > 0
            ? supabase
                .from("data_rooms" as never)
                .select("id, name")
                .in("id", dataRoomIds)
            : Promise.resolve({ data: [] as unknown[] }),
        ]);

      const linksData = linksResult.data ?? [];
      const groupsData = groupsResult.data ?? [];
      const documentsData = documentsResult.data ?? [];
      const dataRoomsData = dataRoomsResult.data ?? [];

      if (linksData.length > 0) {
        const nextMap: Record<string, string> = {};
        (linksData ?? []).forEach((row) => {
          const candidate = row as unknown as Partial<LinkNameRow> | null;
          const id = candidate?.id;
          const name = candidate?.name;
          if (
            typeof id === "string" &&
            typeof name === "string" &&
            name.trim()
          ) {
            nextMap[id] = name.trim();
          }
        });
        setLinkNameById((prev) => ({ ...prev, ...nextMap }));
      }

      if (groupsData.length > 0) {
        const nextMap: Record<string, string> = {};
        (groupsData ?? []).forEach((row) => {
          const candidate = row as unknown as Partial<GroupNameRow> | null;
          const id = candidate?.id;
          const name = candidate?.name;
          if (
            typeof id === "string" &&
            typeof name === "string" &&
            name.trim()
          ) {
            nextMap[id] = name.trim();
          }
        });
        setGroupNameById((prev) => ({ ...prev, ...nextMap }));
      }

      if (documentsData.length > 0) {
        const nextMap: Record<string, string> = {};
        (documentsData ?? []).forEach((row) => {
          const candidate = row as unknown as Partial<DocumentTitleRow> | null;
          const id = candidate?.id;
          const title = candidate?.title;
          if (
            typeof id === "string" &&
            typeof title === "string" &&
            title.trim()
          ) {
            nextMap[id] = title.trim();
          }
        });
        setDocumentTitleById((prev) => ({ ...prev, ...nextMap }));
      }

      if (dataRoomsData.length > 0) {
        const nextMap: Record<string, string> = {};
        (dataRoomsData ?? []).forEach((row) => {
          const candidate = row as unknown as Partial<DataRoomNameRow> | null;
          const id = candidate?.id;
          const name = candidate?.name;
          if (
            typeof id === "string" &&
            typeof name === "string" &&
            name.trim()
          ) {
            nextMap[id] = name.trim();
          }
        });
        setDataRoomNameById((prev) => ({ ...prev, ...nextMap }));
      }
    } catch (error) {
      console.error("[audit-log] failed to load events", {
        workspaceId,
        documentId,
        dataRoomId,
        error,
      });
      setEvents([]);
      setErrorMessage("Unable to load audit events right now.");
    } finally {
      setIsLoading(false);
    }
  }, [dataRoomId, documentId, supabase, workspaceId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  return (
    <section className={cn("flex flex-col space-y-5", className)}>
      <div className="flex flex-col gap-3 border-b border-border/60 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-medium tracking-tight">
            Internal Audit Log
          </h2>
          <p className="text-sm text-muted-foreground">
            Owner-only activity feed for member actions.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="inline-flex items-center gap-2"
          disabled={isLoading}
          onClick={() => void loadEvents()}
        >
          <ArrowClockwise
            className={cn("h-4 w-4", isLoading ? "animate-spin" : undefined)}
            aria-hidden
          />
          Refresh
        </Button>
      </div>

      <div className="min-w-0 flex-1">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`audit-skeleton-${index}`}
                className="h-16 animate-pulse rounded bg-muted/50 motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : errorMessage ? (
          <p className="text-sm text-destructive">{errorMessage}</p>
        ) : events.length === 0 ? (
          <EmptyState
            title="No audit events yet"
            description="Activity appears once members view or download content."
            icon={
              <Shield aria-hidden className="h-6 w-6 text-muted-foreground" />
            }
            compact
            className="py-8"
          />
        ) : (
          <div className="space-y-2">
            {events.map((event) => {
              const actor =
                event.actor_name || event.actor_email || "Workspace member";
              const triggerMetadata = getTriggerMetadata(event.metadata);
              const action = formatEventLabel(
                event.event_type || "event",
                normalizeAuditResourceType(event.resource_type || "resource"),
              );
              const details = detailsByEventId[event.id] ?? [];
              const normalizedResourceType = normalizeAuditResourceType(
                event.resource_type ?? "",
              );
              const resourceLabel =
                getResourceLabel(triggerMetadata) ??
                (normalizedResourceType === "documents"
                  ? documentTitleById[
                      event.document_id ?? event.resource_id ?? ""
                    ]
                  : normalizedResourceType === "data_rooms"
                    ? dataRoomNameById[
                        event.data_room_id ?? event.resource_id ?? ""
                      ]
                    : normalizedResourceType === "links"
                      ? linkNameById[event.resource_id ?? ""]
                      : null);
              const createdAt = event.created_at
                ? new Date(event.created_at)
                : null;
              const timestamp =
                createdAt && isValid(createdAt)
                  ? formatDistanceToNow(createdAt, { addSuffix: true })
                  : "Recently";
              const Icon = getEventIcon(event.event_type, event.resource_type);

              return (
                <details
                  key={event.id}
                  className="group overflow-hidden rounded border border-border/65 bg-card/45 transition-colors open:border-primary/25"
                >
                  <summary className="flex w-full cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-left transition-colors outline-none hover:bg-primary/[0.025] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring focus-visible:outline-solid focus-visible:ring-inset">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded border border-border/70 bg-muted/40 text-primary">
                        {Icon}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{action}</span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] font-normal"
                          >
                            {event.resource_type.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User aria-hidden className="h-3 w-3" />
                            <span className="text-foreground">{actor}</span>
                          </span>
                          {resourceLabel && (
                            <>
                              <span>•</span>
                              <span className="font-medium text-foreground">
                                {resourceLabel}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-xs whitespace-nowrap text-muted-foreground">
                        {timestamp}
                      </div>
                      <CaretDown
                        aria-hidden
                        className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                      />
                    </div>
                  </summary>
                  <div className="border-t border-border/60 bg-muted/20 px-4 py-3">
                    {details.length > 0 ? (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {details.map((item) => (
                          <div
                            key={`${event.id}:${item.label}`}
                            className="space-y-1"
                          >
                            <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                              {item.label}
                            </p>
                            <p className="text-sm font-medium break-all text-foreground">
                              {item.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        No additional details available.
                      </p>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default InternalAuditLogSection;
