export enum TrackerResourceType {
  Document = "document",
  Folder = "folder",
  DataRoom = "data_room",
}

export enum TrackerEvent {
  View = "view",
  Download = "download",
  PageView = "page_view",
  SectionTime = "section_time",
}

export type TrackerContext = {
  sessionId: string; // Ephemeral UUID, not persisted
  linkId: string | null; // Link being viewed (null for direct authenticated access)
  resourceId: string; // Document/resource ID
  resourceType?: TrackerResourceType;
  workspaceId?: string | null; // Provide when already known to avoid extra lookups
  documentId?: string | null; // Underlying document when tracking data room viewers
};
