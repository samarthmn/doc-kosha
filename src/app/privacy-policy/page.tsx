import PrivacyPolicyContent from "./PrivacyPolicyContent";
import type { Metadata } from "next";
import MarketingShell from "@/components/marketing/MarketingShell";

const PrivacyPolicyPage: React.FC<PageProps<"/privacy-policy">> = () => {
  return (
    <MarketingShell className="py-16 sm:py-20">
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <PrivacyPolicyContent />
      </div>
    </MarketingShell>
  );
};

export default PrivacyPolicyPage;

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Read DocKosha's privacy policy and data practices.",
  alternates: { canonical: "/privacy-policy" },
  openGraph: {
    type: "website",
    title: "DocKosha Privacy Policy",
    description: "Read DocKosha's privacy policy and data practices.",
    url: "/privacy-policy",
  },
  twitter: {
    card: "summary_large_image",
    title: "DocKosha Privacy Policy",
    description: "Read DocKosha's privacy policy and data practices.",
  },
};
