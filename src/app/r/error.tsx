"use client";

import { PublicRouteErrorScreen } from "@/components/public/PublicRouteErrorScreen";

// Next.js error-file convention requires a default export.
export default function PublicDataRoomError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PublicRouteErrorScreen error={error} />;
}
