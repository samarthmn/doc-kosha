import React from "react";
import { Inter } from "next/font/google";
import { MotionConfig } from "motion/react";
import ThemeClassApplier from "@/components/theme/ThemeClassApplier";
import { themeInitScript } from "@/components/theme/themeInitScript";
import { publicChunkRecoveryScript } from "@/components/public/publicChunkRecoveryScript";
import { GlobalStoreProvider } from "@/providers/globalStoreProvider";
import InitializeStore from "@/providers/initializeStore";
import "@/app/globals.css";
import ToastProvider from "@/components/providers/ToastProvider";
import { UploadQueueProvider } from "@/components/providers/UploadQueueProvider";
import AppBackground from "@/components/ui/AppBackground";
import NextTopLoader from "nextjs-toploader";
import { CookieConsentBanner } from "@/components/policies/CookieConsentBanner";
import { GoogleAds } from "@/components/analytics/GoogleAds";
import { clientEnv } from "@/lib/env";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${inter.variable} relative isolate min-h-screen bg-background font-sans text-[0.9375rem] text-foreground antialiased selection:bg-primary/20`}
      >
        {/* Applies the persisted theme before first paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* Recovers the public /d and /r routes when hydration dies (failed
            chunk after a deploy, blocked request) instead of leaving
            recipients on a permanent loading screen. */}
        <script
          dangerouslySetInnerHTML={{ __html: publicChunkRecoveryScript }}
        />
        <NextTopLoader color="var(--primary)" showSpinner={false} />
        <MotionConfig reducedMotion="user">
          <GlobalStoreProvider>
            <InitializeStore>
              <ThemeClassApplier />
              <AppBackground />
              <GoogleAds adsId={clientEnv.NEXT_PUBLIC_GOOGLE_ADS_ID} />
              <ToastProvider />
              <UploadQueueProvider>{children}</UploadQueueProvider>
              <CookieConsentBanner />
            </InitializeStore>
          </GlobalStoreProvider>
        </MotionConfig>
      </body>
    </html>
  );
};

export default MainLayout;
