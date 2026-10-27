import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import { getDocsSiteUrl } from "@/lib/site-url";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getDocsSiteUrl(),
  title: {
    default: "DocKosha Documentation",
    template: "%s | DocKosha Documentation",
  },
  description: "Learn how to use, understand, and self-host DocKosha.",
  openGraph: {
    type: "website",
    siteName: "DocKosha Documentation",
  },
  twitter: { card: "summary_large_image" },
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({
  children,
}: RootLayoutProps): React.ReactElement {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
