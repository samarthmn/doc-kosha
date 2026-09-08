import {
  CONVERTED_STORAGE_BUCKET_NAME,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  STORAGE_BUCKET_NAME,
} from "@/lib/constants";
import type { LogicalBucket } from "@/server/storage/r2Keys";

export type PublicDirectAssetDocument = {
  id: string;
  storage_path: string | null;
  converted_storage_path: string | null;
  conversion_status: string | null;
  workspace_id: string | null;
  data_room_id: string | null;
  file_type: string | null;
  size_bytes: number | null;
};

type ConvertedAvailability = "available" | "missing" | "unavailable";

export type PublicDirectAsset = {
  logicalBucket: LogicalBucket;
  path: string;
  variant: "original" | "converted";
  extension: string;
  document: PublicDirectAssetDocument;
};

type ResolvePublicDirectAssetSelectionOptions = {
  document: PublicDirectAssetDocument;
  requestedVariant: "original" | "converted";
  allowConverted?: boolean;
  checkConverted: (
    logicalBucket: LogicalBucket,
    path: string,
  ) => Promise<ConvertedAvailability>;
  repairMissingConverted: (
    document: PublicDirectAssetDocument,
  ) => Promise<PublicDirectAssetDocument | null>;
};

export const resolvePublicDirectAssetSelection = async (
  options: ResolvePublicDirectAssetSelectionOptions,
): Promise<PublicDirectAsset | null> => {
  const originalAsset = (
    document: PublicDirectAssetDocument,
  ): PublicDirectAsset | null => {
    if (!document.storage_path) return null;

    return {
      logicalBucket: document.data_room_id
        ? DATA_ROOM_STORAGE_BUCKET_NAME
        : STORAGE_BUCKET_NAME,
      path: document.storage_path,
      variant: "original",
      extension: (
        document.file_type ||
        document.storage_path.split(".").pop() ||
        "bin"
      ).toLowerCase(),
      document,
    };
  };

  const convertedAsset = (
    document: PublicDirectAssetDocument,
  ): PublicDirectAsset | null => {
    if (
      document.conversion_status !== "completed" ||
      !document.converted_storage_path
    ) {
      return null;
    }

    return {
      logicalBucket: document.data_room_id
        ? DATA_ROOM_CONVERTED_BUCKET_NAME
        : CONVERTED_STORAGE_BUCKET_NAME,
      path: document.converted_storage_path,
      variant: "converted",
      extension: "pdf",
      document,
    };
  };

  if (
    options.requestedVariant !== "converted" ||
    options.allowConverted === false
  ) {
    return originalAsset(options.document);
  }

  const initialConverted = convertedAsset(options.document);
  if (!initialConverted) {
    return originalAsset(options.document);
  }

  const initialAvailability = await options.checkConverted(
    initialConverted.logicalBucket,
    initialConverted.path,
  );
  if (initialAvailability === "available") return initialConverted;
  if (initialAvailability !== "missing") {
    return originalAsset(options.document);
  }

  const repairedDocument = await options.repairMissingConverted(
    options.document,
  );
  if (!repairedDocument) return originalAsset(options.document);

  const repairedConverted = convertedAsset(repairedDocument);
  if (repairedConverted) {
    const repairedAvailability = await options.checkConverted(
      repairedConverted.logicalBucket,
      repairedConverted.path,
    );
    if (repairedAvailability === "available") return repairedConverted;
  }

  return originalAsset(repairedDocument);
};
