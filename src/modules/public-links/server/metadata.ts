import type { Metadata } from "next";
import { getPublicMessages } from "@/modules/public-links/i18n";
import { getEffectivePublicLanguageForLink } from "@/modules/public-links/server/settings";
import { DEFAULT_PUBLIC_LANGUAGE } from "@/modules/public-links/types";

export const getPublicLinkLanguageForMetadata = async (params: {
  linkId: string;
  documentId?: string;
  dataRoomId?: string;
}) => {
  return getEffectivePublicLanguageForLink(params);
};

export const buildPublicMetadata = (params: {
  kind: "document" | "data_room" | "secure_link";
  language?: string;
  canonical: string;
}): Metadata => {
  const messages = getPublicMessages(
    params.language === "fr" ? "fr" : DEFAULT_PUBLIC_LANGUAGE,
  );

  const metadataByKind = {
    document: {
      title: messages.metadata.documentViewerTitle,
      description: messages.metadata.documentViewerDescription,
    },
    data_room: {
      title: messages.metadata.dataRoomViewerTitle,
      description: messages.metadata.dataRoomViewerDescription,
    },
    secure_link: {
      title: messages.metadata.secureViewerLinkTitle,
      description: messages.metadata.secureViewerLinkDescription,
    },
  } as const;

  const selected = metadataByKind[params.kind];

  return {
    title: selected.title,
    description: selected.description,
    robots: { index: false, follow: false, nocache: true },
    alternates: { canonical: params.canonical },
    other: {
      google: "notranslate",
    },
  };
};
