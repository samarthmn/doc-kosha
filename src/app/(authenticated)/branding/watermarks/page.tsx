import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Watermarks",
  alternates: { canonical: "/custom-watermarks" },
};

const BrandingWatermarksPage: React.FC = () => {
  redirect("/custom-watermarks");
};

export default BrandingWatermarksPage;
