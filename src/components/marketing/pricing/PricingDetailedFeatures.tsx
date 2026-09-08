import React from "react";
import {
  ChartBar,
  FileText,
  FolderOpen,
  Lock,
  Scroll,
  Shield,
} from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

type FeatureCategory = {
  id: string;
  title: string;
  icon: React.ElementType;
  items: {
    name: string;
    description?: string;
  }[];
};

const categories: FeatureCategory[] = [
  {
    id: "room-setup",
    title: "Room Setup & Document Control",
    icon: FolderOpen,
    items: [
      { name: "Bulk upload flow", description: "Move room prep faster" },
      { name: "Structured data rooms", description: "Organize by folder" },
      { name: "Version history", description: "Preview, restore, retain" },
      {
        name: "Custom URLs",
        description: "Cleaner room and document links",
      },
    ],
  },
  {
    id: "security",
    title: "Sharing Controls",
    icon: Shield,
    items: [
      { name: "Dynamic watermarking", description: "Viewer accountability" },
      { name: "Granular permissions", description: "Room, folder, file" },
      { name: "Download controls", description: "Reduce forwarding risk" },
      { name: "Link expirations", description: "Time-bound access" },
    ],
  },
  {
    id: "viewer",
    title: "Client-Facing Viewer",
    icon: FileText,
    items: [
      { name: "PDF-first rendering", description: "Consistent viewing" },
      { name: "Conversion fallback", description: "Non-PDF docs supported" },
      {
        name: "Threaded commenting",
        description: "Pinned to highlighted text",
      },
      {
        name: "Secure PDF redaction",
        description: "Permanent removal through DocYantra 0.0.25",
      },
    ],
  },
  {
    id: "analytics",
    title: "Analytics & Follow-Up",
    icon: ChartBar,
    items: [
      { name: "Page-level analytics", description: "Time spent per page" },
      {
        name: "Viewer analytics",
        description: "Anonymized by default; identified when gated",
      },
      { name: "Download events", description: "Know what moved" },
      { name: "Data room analytics", description: "Room-level visibility" },
    ],
  },
  {
    id: "gating",
    title: "Verification & Gating",
    icon: Lock,
    items: [
      { name: "Email verification", description: "Identity check" },
      { name: "Link expirations", description: "Time-limited access" },
      { name: "Password protection", description: "Optional gating" },
      { name: "Custom NDA templates", description: "Pinned per link" },
      {
        name: "Allowlists and blocklists",
        description: "Emails and user groups",
      },
    ],
  },
  {
    id: "governance",
    title: "Internal Governance",
    icon: Scroll,
    items: [
      { name: "Owner-only audit logs", description: "Workspace activity" },
      { name: "Workspace roles", description: "Owner, editor, viewer" },
      { name: "Workspace-based pricing", description: "No per-seat drift" },
      { name: "Privacy-first analytics", description: "Minimal collection" },
    ],
  },
];

const PricingDetailedFeatures: React.FC<{ className?: string }> = ({
  className,
}) => {
  return (
    <div className={cn("py-8", className)}>
      <div className="mb-10">
        <h3 className="max-w-xl text-3xl font-medium tracking-[-0.03em]">
          Core capabilities for secure document workflows
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {categories.map((category) => (
          <div
            key={category.id}
            className="rounded-lg border bg-card p-6 [box-shadow:var(--dk-shadow-card)] transition-colors hover:border-primary/35"
          >
            <div className="mb-6 flex items-center gap-3 border-b pb-4">
              <category.icon className="h-5 w-5 text-primary" />
              <h4 className="text-lg font-medium">{category.title}</h4>
            </div>

            <div className="grid grid-cols-1 gap-x-2 gap-y-4 sm:grid-cols-2">
              {category.items.map((item, i) => (
                <div key={i} className="flex flex-col">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/40" />
                    {item.name}
                  </span>
                  {item.description && (
                    <span className="ml-3.5 pl-0.5 text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PricingDetailedFeatures;
