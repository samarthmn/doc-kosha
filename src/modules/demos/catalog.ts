export interface DemoStep {
  id: string;
  title: string;
  videoUrl: string;
  markdownUrl: string;
}

export interface DemoWorkflow {
  id: string;
  slug: string;
  title: string;
  description: string;
  steps: DemoStep[];
}

export interface DemoWorkflowStepMatch {
  workflow: DemoWorkflow;
  step: DemoStep;
  stepIndex: number;
  stepNumber: number;
}

const demoWorkflows: DemoWorkflow[] = [
  {
    id: "1",
    slug: "account-onboarding",
    title: "Account Setup and Onboarding",
    description:
      "How a workspace owner signs up, creates a workspace, and completes first-time setup.",
    steps: [
      {
        id: "1.1",
        title: "Create account and complete onboarding",
        videoUrl:
          "https://public.dockosha.com/demo/1-create_account_onboarding_walkthrough.mp4",
        markdownUrl:
          "https://public.dockosha.com/demo-md/1-create_account_onboarding_walkthrough.md",
      },
    ],
  },
  {
    id: "2",
    slug: "documents-upload-organize",
    title: "Upload and Organize Documents",
    description:
      "End-to-end document ingestion: upload files, structure folders, and prepare content for sharing.",
    steps: [
      {
        id: "2.1",
        title: "Upload and organize documents",
        videoUrl:
          "https://public.dockosha.com/demo/2-dockosha_documents_upload_organize_walkthrough.mp4",
        markdownUrl:
          "https://public.dockosha.com/demo-md/2-dockosha_documents_upload_organize_walkthrough.md",
      },
    ],
  },
  {
    id: "3",
    slug: "single-document-sharing",
    title: "Single Document Sharing Journey",
    description:
      "Full lifecycle for a shared document: publish link, review viewer interactions, and inspect analytics.",
    steps: [
      {
        id: "3.1.1",
        title: "Create and configure a share link",
        videoUrl:
          "https://public.dockosha.com/demo/3-1-dockosha_share_link_video_steps.mp4",
        markdownUrl:
          "https://public.dockosha.com/demo-md/3-1-dockosha_share_link_video_steps.md",
      },
      {
        id: "3.2.1",
        title: "Viewer access and commenting walkthrough",
        videoUrl:
          "https://public.dockosha.com/demo/3-2-docKosha_viewing_commenting_video_steps.mp4",
        markdownUrl:
          "https://public.dockosha.com/demo-md/3-2-docKosha_viewing_commenting_video_steps.md",
      },
      {
        id: "3.3.1",
        title: "Review document analytics",
        videoUrl:
          "https://public.dockosha.com/demo/3-3-video_analysis_view_document_analytics.mp4",
        markdownUrl:
          "https://public.dockosha.com/demo-md/3-3-video_analysis_view_document_analytics.md",
      },
    ],
  },
  {
    id: "4",
    slug: "internal-comments-workflow",
    title: "Internal Comment Collaboration",
    description:
      "Internal review flow for creating comment threads, replying, and resolving conversations.",
    steps: [
      {
        id: "4.1",
        title: "Internal comments, replies, and resolve",
        videoUrl:
          "https://public.dockosha.com/demo/4-video_analysis_internal_comment_replies_resolve.mp4",
        markdownUrl:
          "https://public.dockosha.com/demo-md/4-video_analysis_internal_comment_replies_resolve.md",
      },
    ],
  },
  {
    id: "5",
    slug: "nda-gate-and-otp",
    title: "NDA Gate and OTP Verification",
    description:
      "Secure external sharing with NDA consent and OTP verification gates before access is granted.",
    steps: [
      {
        id: "5.1.1",
        title: "Create an NDA-protected link",
        videoUrl:
          "https://public.dockosha.com/demo/5-1-video_walkthrough_create_nda_link.mp4",
        markdownUrl:
          "https://public.dockosha.com/demo-md/5-1-video_walkthrough_create_nda_link.md",
      },
      {
        id: "5.2.1",
        title: "NDA acceptance and OTP walkthrough",
        videoUrl:
          "https://public.dockosha.com/demo/5-2-nda_gate_otp_walkthrough.mp4",
        markdownUrl:
          "https://public.dockosha.com/demo-md/5-2-nda_gate_otp_walkthrough.md",
      },
    ],
  },
  {
    id: "6",
    slug: "data-room-workflow",
    title: "Data Room Workflow",
    description:
      "Build a data room, apply granular access controls, and monitor engagement at the room level.",
    steps: [
      {
        id: "6.1.1",
        title: "Create data room and upload files",
        videoUrl:
          "https://public.dockosha.com/demo/6-1-dockosha_data_room_upload_video_steps.mp4",
        markdownUrl:
          "https://public.dockosha.com/demo-md/6-1-dockosha_data_room_upload_video_steps.md",
      },
      {
        id: "6.2.1",
        title: "Configure user groups and allow/block rules",
        videoUrl:
          "https://public.dockosha.com/demo/6-2-video_walkthrough_usergroups_allowlist_blocklist_alc_viewing.mp4",
        markdownUrl:
          "https://public.dockosha.com/demo-md/6-2-video_walkthrough_usergroups_allowlist_blocklist_alc_viewing.md",
      },
      {
        id: "6.3.1",
        title: "Analyze data room engagement",
        videoUrl:
          "https://public.dockosha.com/demo/6-3-data-room-engagement-analytics-walkthrough.mp4",
        markdownUrl:
          "https://public.dockosha.com/demo-md/6-3-data-room-engagement-analytics-walkthrough.md",
      },
    ],
  },
  {
    id: "7",
    slug: "redact-sensitive-content",
    title: "Redact Sensitive Content",
    description:
      "Permanently remove confidential information from documents before external distribution.",
    steps: [
      {
        id: "7.1",
        title: "Redact sensitive content in documents",
        videoUrl:
          "https://public.dockosha.com/demo/7-redact_sensitive_content_video_walkthrough.mp4",
        markdownUrl:
          "https://public.dockosha.com/demo-md/7-redact_sensitive_content_video_walkthrough.md",
      },
    ],
  },
  {
    id: "8",
    slug: "dataroom-access-and-audit-logs",
    title: "Data Room Access and Audit Logs",
    description:
      "Control who can access a room and audit key activity with event-level visibility.",
    steps: [
      {
        id: "8.1.1",
        title: "Manage data room access",
        videoUrl:
          "https://public.dockosha.com/demo/8-1-dataroom-access-video-analysis.mp4",
        markdownUrl:
          "https://public.dockosha.com/demo-md/8-1-dataroom-access-video-analysis.md",
      },
      {
        id: "8.2.1",
        title: "Review audit logs",
        videoUrl:
          "https://public.dockosha.com/demo/8-2-audit_logs_video_analysis.mp4",
        markdownUrl:
          "https://public.dockosha.com/demo-md/8-2-audit_logs_video_analysis.md",
      },
    ],
  },
  {
    id: "9",
    slug: "watermark-template",
    title: "Watermark Template Management",
    description:
      "Configure reusable watermark templates and apply them to protected document sharing flows.",
    steps: [
      {
        id: "9.1",
        title: "Create and use watermark templates",
        videoUrl:
          "https://public.dockosha.com/demo/9-watermark_template_video_steps.mp4",
        markdownUrl:
          "https://public.dockosha.com/demo-md/9-watermark_template_video_steps.md",
      },
    ],
  },
  {
    id: "10",
    slug: "custom-domain-branding",
    title: "Custom Domain Branding",
    description:
      "Set up branded domains and polished link presentation for customer-facing sharing experiences.",
    steps: [
      {
        id: "10.1",
        title: "Configure custom domain branding",
        videoUrl:
          "https://public.dockosha.com/demo/10-custom-domain-branding-video-steps.mp4",
        markdownUrl:
          "https://public.dockosha.com/demo-md/10-custom-domain-branding-video-steps.md",
      },
    ],
  },
];

export const getAllDemoWorkflows = (): DemoWorkflow[] => demoWorkflows;

export const getDemoWorkflowBySlug = (slug: string): DemoWorkflow | undefined =>
  demoWorkflows.find((workflow) => workflow.slug === slug);

export const getAllDemoWorkflowSteps = (): DemoWorkflowStepMatch[] =>
  demoWorkflows.flatMap((workflow) =>
    workflow.steps.map((step, stepIndex) => ({
      workflow,
      step,
      stepIndex,
      stepNumber: stepIndex + 1,
    })),
  );

export const getDemoWorkflowStep = (
  slug: string,
  stepNumber: number,
): DemoWorkflowStepMatch | undefined => {
  const workflow = getDemoWorkflowBySlug(slug);

  if (!workflow) {
    return undefined;
  }

  const stepIndex = stepNumber - 1;
  const step = workflow.steps[stepIndex];

  if (!step) {
    return undefined;
  }

  return {
    workflow,
    step,
    stepIndex,
    stepNumber,
  };
};

export const buildDemoWorkflowStepHref = (
  slug: string,
  stepNumber: number,
): string => {
  if (stepNumber <= 1) {
    return `/demos/${slug}`;
  }

  return `/demos/${slug}?step=${stepNumber}`;
};

export const getDemoWorkflowNeighbors = (slug: string) => {
  const index = demoWorkflows.findIndex((workflow) => workflow.slug === slug);

  if (index < 0) {
    return { previous: undefined, next: undefined };
  }

  return {
    previous: index > 0 ? demoWorkflows[index - 1] : undefined,
    next:
      index < demoWorkflows.length - 1 ? demoWorkflows[index + 1] : undefined,
  };
};
