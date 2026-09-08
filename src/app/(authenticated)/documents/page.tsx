import DocumentsIndexPageClient from "@/components/pages/DocumentsIndexPageClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documents",
  alternates: { canonical: "/documents" },
};

const DocumentsPage: React.FC<PageProps<"/documents">> = () => {
  return <DocumentsIndexPageClient />;
};

export default DocumentsPage;
