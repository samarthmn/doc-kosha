import MainLayout from "@/components/layouts/MainLayout";
import type { Metadata, Viewport } from "next";
import { clientEnv } from "@/lib/env";
import { startLocalLifecycleEmailProcessor } from "@/modules/lifecycle-email/server";

const appUrl = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

// viewport-fit=cover is required for env(safe-area-inset-*) to resolve on iOS
// (fixed mobile chrome relies on it for notch/home-indicator padding).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "DocKosha",
    template: "%s | DocKosha",
  },
  applicationName: "DocKosha",
  description:
    "DocKosha is an open-source document sharing and virtual data room application with access controls, watermarking, and privacy-first analytics. Inspect both the application and DocYantra engine, self-host, or start free on DocKosha Cloud.",
  keywords: [
    "M&A data room",
    "virtual data room for M&A",
    "deal room software",
    "due diligence data room",
    "boutique advisory data room",
    "secure document sharing",
    "free secure document sharing",
    "secure file sharing",
    "virtual data room",
    "virtual data room pricing",
    "data room software",
    "document analytics",
    "document engagement analytics",
    "online document viewer",
    "document watermarking",
    "link permissions",
    "NDA gate",
    "document access control",
    "due diligence",
  ],
  openGraph: {
    type: "website",
    url: appUrl,
    siteName: "DocKosha",
    title: "DocKosha — Open-Source Document Sharing & Data Rooms",
    description:
      "Open-source document sharing and virtual data rooms with access controls, watermarking, and privacy-first analytics. Available on DocKosha Cloud.",
  },
  twitter: {
    card: "summary_large_image",
    title: "DocKosha — Open-Source Document Sharing & Data Rooms",
    description:
      "Open-source document sharing and virtual data rooms with access controls, watermarking, and privacy-first analytics. Available on DocKosha Cloud.",
  },
  other: {
    "facebook-domain-verification": "7cgc1ftqamr9oqoufnfatbdo544nib",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  startLocalLifecycleEmailProcessor();

  return <MainLayout>{children}</MainLayout>;
};

export default RootLayout;
