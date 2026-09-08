import CookiePolicyContent from "./CookiePolicyContent";
import type { Metadata } from "next";
import MarketingShell from "@/components/marketing/MarketingShell";

const CookiePolicyPage: React.FC<PageProps<"/cookie-policy">> = () => {
  return (
    <MarketingShell className="py-16 sm:py-20">
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <CookiePolicyContent />
      </div>
    </MarketingShell>
  );
};

export default CookiePolicyPage;

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "Read DocKosha's cookie policy.",
  alternates: { canonical: "/cookie-policy" },
  openGraph: {
    type: "website",
    title: "DocKosha Cookie Policy",
    description: "Read DocKosha's cookie policy.",
    url: "/cookie-policy",
  },
  twitter: {
    card: "summary_large_image",
    title: "DocKosha Cookie Policy",
    description: "Read DocKosha's cookie policy.",
  },
};
