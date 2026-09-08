import { useMemo } from "react";

import type { Tables } from "@/types/generated/supabase";

export type DocumentType = Tables<"documents">;
export type FolderType = Tables<"folders">;

export type SortColumn = "name" | "modified" | "size";
export type SortDirection = "asc" | "desc";

type FolderRowData = {
  kind: "folder";
  id: string;
  name: string;
  createdAt: string | null;
  openPath: string;
};

type DocumentRowData = {
  kind: "doc";
  id: string;
  title: string;
  updatedAt: string | null;
  sizeBytes: number | null;
  resourcePath: string;
  linksPath?: string;
  conversionStatus?: string | null;
};

type DocumentsTableRow = FolderRowData | DocumentRowData;

type UseDocumentsTableRowsArgs = {
  buildFolderPath: (id: string) => string;
  currentFolder: string;
  documents: DocumentType[];
  folderList: FolderType[];
  viewBasePath: string;
  sortBy?: SortColumn;
  sortDir: SortDirection;
  includeLinks?: boolean;
};

export const useDocumentsTableRows = ({
  buildFolderPath,
  currentFolder,
  documents,
  folderList,
  viewBasePath,
  sortBy,
  sortDir,
  includeLinks = true,
}: UseDocumentsTableRowsArgs) => {
  return useMemo(() => {
    const normalizedFolder = currentFolder === "root" ? "root" : currentFolder;

    const folderChildren =
      normalizedFolder === "root"
        ? folderList.filter(
            (folder) => folder.parent_folder_id == null && folder.id !== "root",
          )
        : folderList.filter(
            (folder) => folder.parent_folder_id === normalizedFolder,
          );

    const documentChildren =
      normalizedFolder === "root"
        ? documents.filter((doc) => doc.folder_id == null)
        : documents.filter((doc) => doc.folder_id === normalizedFolder);

    const folderRows: FolderRowData[] = folderChildren.map((folder) => ({
      kind: "folder",
      id: folder.id,
      name: folder.name,
      createdAt: folder.created_at,
      openPath: buildFolderPath(folder.id),
    }));

    const documentRows: DocumentRowData[] = documentChildren.map((doc) => {
      const resourcePath = `${viewBasePath}/${doc.id}`;
      return {
        kind: "doc",
        id: doc.id,
        title: doc.title,
        updatedAt: doc.updated_at,
        sizeBytes: doc.size_bytes,
        resourcePath,
        linksPath: includeLinks ? `${resourcePath}/share` : undefined,
        conversionStatus: doc.conversion_status,
      };
    });

    const rows: DocumentsTableRow[] = [...folderRows, ...documentRows];
    const adjust = (value: number) => (sortDir === "asc" ? value : -value);
    const toTime = (value: string | null | undefined) =>
      value ? new Date(value).getTime() : 0;

    rows.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === "folder" ? -1 : 1;
      }

      if (sortBy === "name") {
        const aName = a.kind === "folder" ? a.name : a.title;
        const bName = b.kind === "folder" ? b.name : b.title;
        return adjust(aName.localeCompare(bName));
      }

      if (sortBy === "modified") {
        const aDate = a.kind === "folder" ? a.createdAt : a.updatedAt;
        const bDate = b.kind === "folder" ? b.createdAt : b.updatedAt;
        return adjust(toTime(aDate) - toTime(bDate));
      }

      if (a.kind === "folder" && b.kind === "folder") {
        return adjust(a.name.localeCompare(b.name));
      }
      if (a.kind === "folder") return -1;
      if (b.kind === "folder") return 1;

      const sizeDiff = (a.sizeBytes ?? NaN) - (b.sizeBytes ?? NaN);
      return adjust(Number.isNaN(sizeDiff) ? 0 : sizeDiff);
    });

    return {
      rows,
      isEmpty: rows.length === 0,
    };
  }, [
    buildFolderPath,
    currentFolder,
    documents,
    folderList,
    viewBasePath,
    sortBy,
    sortDir,
    includeLinks,
  ]);
};
