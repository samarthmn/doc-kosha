import type { Metadata } from "next";
import DemosIndexPage from "@/components/marketing/pages/DemosIndexPage";

export const metadata: Metadata = {
  title: "DocKosha Demo Videos",
  description:
    "Watch all DocKosha product demos with step-by-step workflow videos and walkthrough notes.",
  alternates: { canonical: "/demos" },
};

const DemosRoutePage: React.FC = () => {
  return <DemosIndexPage />;
};

export default DemosRoutePage;
