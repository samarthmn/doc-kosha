import BrandingSettingsClient from "@/components/pages/BrandingSettingsClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Watermarks",
  alternates: { canonical: "/custom-watermarks" },
};

const CustomWatermarksPage: React.FC = () => {
  return <BrandingSettingsClient section="watermark" />;
};

export default CustomWatermarksPage;
