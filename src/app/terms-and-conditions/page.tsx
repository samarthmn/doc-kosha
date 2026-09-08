import TermsAndConditionsContent from "./TermsAndConditionsContent";
import type { Metadata } from "next";
import MarketingShell from "@/components/marketing/MarketingShell";

const TermsAndConditionsPage: React.FC<
  PageProps<"/terms-and-conditions">
> = () => {
  return (
    <MarketingShell className="py-16 sm:py-20">
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <TermsAndConditionsContent />
      </div>
    </MarketingShell>
  );
};

export default TermsAndConditionsPage;

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: "Read DocKosha's terms and conditions.",
  alternates: { canonical: "/terms-and-conditions" },
  openGraph: {
    type: "website",
    title: "DocKosha Terms and Conditions",
    description: "Read DocKosha's terms and conditions.",
    url: "/terms-and-conditions",
  },
  twitter: {
    card: "summary_large_image",
    title: "DocKosha Terms and Conditions",
    description: "Read DocKosha's terms and conditions.",
  },
};
