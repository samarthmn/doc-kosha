import React from "react";
import { PublicHydrationMarker } from "@/components/public/PublicHydrationMarker";

// Next.js layout-file convention requires a default export.
export default function PublicDocumentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PublicHydrationMarker />
      {children}
    </>
  );
}
