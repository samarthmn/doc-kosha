import React from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ArrowSquareOut,
  FileText,
  UploadSimple,
} from "@phosphor-icons/react/ssr";

interface RecentDocument {
  id: string;
  title: string;
  updated_at: string;
  file_type: string;
}

interface RecentDocumentsProps {
  documents: RecentDocument[];
  canAccessDocuments?: boolean;
}

export const RecentDocuments: React.FC<RecentDocumentsProps> = ({
  documents,
  canAccessDocuments = true,
}) => {
  if (!canAccessDocuments) {
    return (
      <Card className="h-full border-border/70 bg-card/55">
        <CardHeader className="border-b border-border/50 pb-3">
          <CardTitle className="text-[0.95rem] font-medium">
            Recent Documents
          </CardTitle>
          <CardDescription className="text-xs">
            You don’t have access to workspace Documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex h-[200px] flex-col items-center justify-center">
          <EmptyState
            variant="bare"
            compact
            icon={
              <FileText className="h-6 w-6 text-muted-foreground" aria-hidden />
            }
            title="Access restricted"
            description="Ask a workspace owner to enable the Documents tab for your membership."
            actions={
              <Button asChild size="sm">
                <Link href="/data-rooms">Go to Data Rooms</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full border-border/70 bg-card/55">
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="text-[0.95rem] font-medium">
          Recent Documents
        </CardTitle>
        <CardDescription className="text-xs">
          Recently updated documents
        </CardDescription>
      </CardHeader>
      <CardContent
        className={
          documents.length === 0
            ? "flex h-[200px] flex-col items-center justify-center"
            : undefined
        }
      >
        {documents.length === 0 ? (
          <EmptyState
            variant="bare"
            compact
            icon={
              <UploadSimple
                className="h-6 w-6 text-muted-foreground"
                aria-hidden
              />
            }
            title="No documents found"
            description="Upload your first document to get started."
            actions={
              <Button asChild size="sm">
                <Link href="/documents">Go to Documents</Link>
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-border/50">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded border border-primary/20 bg-primary/10">
                    <FileText className="size-4 text-primary" aria-hidden />
                  </div>
                  <div className="space-y-1">
                    <p className="max-w-[200px] truncate text-sm font-medium">
                      {doc.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(doc.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/documents/view/${doc.id}`}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                >
                  <ArrowSquareOut className="size-4" aria-hidden />
                  <span className="sr-only">View</span>
                </Link>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
