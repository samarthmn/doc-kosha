import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Buildings } from "@phosphor-icons/react/ssr";
import { TestimonialForm } from "@/modules/testimonials/TestimonialForm";
import { getTestimonialPageData } from "@/modules/testimonials/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";

export const metadata: Metadata = {
  title: "Share a Testimonial",
  alternates: { canonical: "/testimonial" },
};

const TestimonialPage: React.FC = async () => {
  const pageData = await getTestimonialPageData();

  if (!pageData.user) {
    redirect("/auth/sign-in?redirect=/testimonial");
  }

  return (
    <PageContainer className="mx-auto max-w-3xl py-8 md:py-10">
      <div className="space-y-5">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Share a testimonial
          </h1>
        </div>

        {pageData.workspace ? (
          <TestimonialForm
            workspaceName={pageData.workspace.name}
            workspaceId={pageData.workspace.id}
            userId={pageData.user.id}
            initialValues={pageData.initialValues}
            existingSubmissionAt={pageData.existingSubmission?.created_at}
            existingHeadshotStoragePath={
              pageData.existingSubmission?.headshot_storage_path
            }
          />
        ) : (
          <EmptyState
            icon={
              <Buildings
                className="h-6 w-6 text-muted-foreground"
                aria-hidden
              />
            }
            title="No workspace available"
            description="This form only works for authenticated users with an active workspace membership."
            actions={
              <Button asChild variant="outline">
                <Link href="/dashboard">Return to dashboard</Link>
              </Button>
            }
          />
        )}
      </div>
    </PageContainer>
  );
};

export default TestimonialPage;
