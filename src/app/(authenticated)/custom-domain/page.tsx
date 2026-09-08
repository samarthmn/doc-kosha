import BrandingSettingsClient from "@/components/pages/BrandingSettingsClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Custom domain",
  alternates: { canonical: "/custom-domain" },
};

const CustomDomainPage: React.FC = () => {
  return <BrandingSettingsClient section="identity" />;
};

export default CustomDomainPage;
