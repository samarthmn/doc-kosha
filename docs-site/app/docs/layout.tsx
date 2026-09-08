import type { ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { source } from "@/lib/source";

interface DocumentationLayoutProps {
  children: ReactNode;
}

export default function DocumentationLayout({
  children,
}: DocumentationLayoutProps): React.ReactElement {
  return (
    <DocsLayout nav={{ title: "DocKosha" }} tree={source.getPageTree()}>
      {children}
    </DocsLayout>
  );
}
