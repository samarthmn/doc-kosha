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
    template: "DocKosha | %s",
  },
  applicationName: "DocKosha",
  description:
    "DocKosha is an M&A data room and secure document sharing platform with high-fidelity viewing, watermarking, and privacy-first analytics.",
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
    title: "DocKosha — M&A Data Rooms & Secure Document Sharing",
    description:
      "M&A data rooms and secure document sharing with privacy-first analytics, watermarking, and high-fidelity rendering.",
  },
  twitter: {
    card: "summary_large_image",
    title: "DocKosha — M&A Data Rooms & Secure Document Sharing",
    description:
      "M&A data rooms and secure document sharing with privacy-first analytics, watermarking, and high-fidelity rendering.",
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
