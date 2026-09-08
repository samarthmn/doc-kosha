import {
  Bell,
  Chat,
  ChatCircle,
  ChatCircleDots,
  Drop,
  FileArrowDown,
  Fingerprint,
  IdentificationBadge,
  Lock,
  SealCheck,
  ShieldCheck,
  Signature,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { Tables } from "@/types/generated/supabase";

type LinkFeatureContext = "document" | "data_room";

export type LinkFeatureBadge = {
  key: string;
  label: string;
  description: string;
  icon: Icon;
};

type LinkRow = Tables<"links">;

type ContextCopy = {
  nda: (noun: string) => string;
  analyticsEmails: (noun: string) => string;
  downloads: (noun: string) => string;
  watermark: (noun: string) => string;
  dynamicWatermark: (noun: string) => string;
  screenshot: (noun: string) => string;
  feedback: (noun: string) => string;
  qas: (noun: string) => string;
  comments: (noun: string) => string;
};

const CONTEXT_COPY: Record<LinkFeatureContext, ContextCopy> = {
  document: {
    nda: (noun) => `Viewers must sign an NDA before the ${noun} opens.`,
    analyticsEmails: (_noun) =>
      "Stores verified viewer emails to unlock analytics insights.",
    downloads: (noun) =>
      `Authorized viewers can download the original ${noun}.`,
    watermark: (noun) =>
      `Applies the branding watermark to the shared ${noun}.`,
    dynamicWatermark: (_noun) =>
      "Burns viewer-specific email, IP, and timestamp details into the delivered PDF watermark.",
    screenshot: (_noun) =>
      "Deters casual capture with a blur shield and hotkey detection. Browsers cannot block OS-level screenshots.",
    feedback: (_noun) =>
      "Viewers can submit structured feedback from the viewer.",
    qas: (noun) => `Curated Q&A pairs are shown alongside the ${noun}.`,
    comments: (_noun) =>
      "Viewers can discuss highlighted text in a dedicated comments panel.",
  },
  data_room: {
    nda: (_noun) => "Viewers must sign an NDA before the room opens.",
    analyticsEmails: (_noun) =>
      "Stores verified viewer emails for downstream analytics.",
    downloads: (_noun) => "Authorized viewers can download shared documents.",
    watermark: (_noun) => "Applies the workspace watermark to shared files.",
    dynamicWatermark: (_noun) =>
      "Burns viewer-specific details into delivered document watermarks.",
    screenshot: (_noun) =>
      "Deters casual screenshot attempts with a best-effort blur shield.",
    feedback: (_noun) =>
      "Viewers can submit feedback directly from the viewer.",
    qas: (_noun) => "Displays curated Q&A alongside the room documents.",
    comments: (_noun) =>
      "Viewers can discuss highlighted text in a dedicated comments panel.",
  },
};

export const describeLinkFeatures = (
  link: LinkRow,
  context: LinkFeatureContext,
  options?: { resourceNoun?: string },
): LinkFeatureBadge[] => {
  const copy = CONTEXT_COPY[context];
  const defaultNoun = context === "data_room" ? "room" : "document";
  const resourceNoun =
    options?.resourceNoun?.trim().toLowerCase() || defaultNoun;
  const features: LinkFeatureBadge[] = [];

  if (link.password_hash) {
    features.push({
      key: "password",
      label: "Password",
      description: "Viewers must enter the link password to gain access.",
      icon: Lock,
    });
  }
  if (link.nda_gate) {
    features.push({
      key: "nda",
      label: "NDA",
      description: copy.nda(resourceNoun),
      icon: Signature,
    });
  }
  if (link.email_verification) {
    features.push({
      key: "email_verification",
      label: "Email verification",
      description:
        "Requires OTP verification, remembered for 30 days in the same browser.",
      icon: SealCheck,
    });
  }
  if (link.collect_email_for_analytics) {
    features.push({
      key: "collect_email",
      label: "Analytics emails",
      description: copy.analyticsEmails(resourceNoun),
      icon: IdentificationBadge,
    });
  }
  if (link.can_download) {
    features.push({
      key: "downloads",
      label: "Downloads",
      description: copy.downloads(resourceNoun),
      icon: FileArrowDown,
    });
  }
  if (link.apply_watermark) {
    features.push({
      key: "watermark",
      label: "Watermark",
      description: copy.watermark(resourceNoun),
      icon: Drop,
    });
  }
  if (link.dynamic_watermark_variables) {
    features.push({
      key: "dynamic_watermark",
      label: "Dynamic watermark",
      description: copy.dynamicWatermark(resourceNoun),
      icon: Fingerprint,
    });
  }
  if (link.screenshot_protection) {
    features.push({
      key: "screenshot_protection",
      label: "Screenshot shield",
      description: copy.screenshot(resourceNoun),
      icon: ShieldCheck,
    });
  }
  if (link.email_notify) {
    features.push({
      key: "email_notify",
      label: "Email alerts",
      description: "Sends team members an email when this link is viewed.",
      icon: Bell,
    });
  }
  if (link.show_feedback) {
    features.push({
      key: "feedback",
      label: "Feedback",
      description: copy.feedback(resourceNoun),
      icon: ChatCircle,
    });
  }
  if (link.show_qas) {
    features.push({
      key: "qas",
      label: "Q&A",
      description: copy.qas(resourceNoun),
      icon: Chat,
    });
  }
  if (link.comments_enabled) {
    features.push({
      key: "comments",
      label: "Comments",
      description: copy.comments(resourceNoun),
      icon: ChatCircleDots,
    });
  }

  return features;
};
