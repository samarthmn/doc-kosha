import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Branding",
  alternates: { canonical: "/branding" },
};

const BrandingPage: React.FC<PageProps<"/branding">> = async ({
  searchParams,
}) => {
  const params = await searchParams;
  const section = typeof params?.section === "string" ? params.section : null;
  if (section === "identity") {
    redirect("/custom-domain");
  }
  if (section === "watermark" || section === "watermarks") {
    redirect("/custom-watermarks");
  }
  redirect("/custom-domain");
};

export default BrandingPage;
