import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Custom domain",
  alternates: { canonical: "/custom-domain" },
};

const BrandingIdentityPage: React.FC = () => {
  redirect("/custom-domain");
};

export default BrandingIdentityPage;
