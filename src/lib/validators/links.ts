import { z } from "zod";
import { PUBLIC_LANGUAGE_VALUES } from "@/modules/public-links/types";

const QAPairSchema = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(2000),
});

export const LinkSettingsSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    custom_slug: z.string().trim().max(64).optional().nullable(),
    document_id: z.string().uuid().optional().nullable(),
    data_room_id: z.string().uuid().optional().nullable(),
    password: z.string().max(256).optional().nullable(),
    email_notify: z.boolean().optional().default(false),
    expires_at: z.string().datetime().optional().nullable(),
    can_download: z.boolean().optional().default(false),
    email_verification: z.boolean().optional().default(false),
    screenshot_protection: z.boolean().optional().default(true),
    apply_watermark: z.boolean().optional().default(false),
    dynamic_watermark_variables: z.boolean().optional().default(false),
    watermark_id: z.string().uuid().optional().nullable(),
    dynamic_watermark_email: z.boolean().optional().default(false),
    dynamic_watermark_ip: z.boolean().optional().default(false),
    dynamic_watermark_datetime: z.boolean().optional().default(false),
    nda_gate: z.boolean().optional().default(false),
    nda_template_id: z.string().uuid().optional().nullable(),
    show_qas: z.boolean().optional().default(false),
    curated_qas: z.array(QAPairSchema).optional().default([]),
    show_feedback: z.boolean().optional().default(true),
    comments_enabled: z.boolean().optional().default(false),
    collect_email_for_analytics: z.boolean().optional().default(false),
    public_language_override: z
      .enum(PUBLIC_LANGUAGE_VALUES)
      .optional()
      .nullable(),
  })
  .refine(
    (value) =>
      Boolean(value.document_id && !value.data_room_id) ||
      Boolean(!value.document_id && value.data_room_id),
    {
      message: "Provide either a document or data room target",
      path: ["document_id"],
    },
  )
  .refine(
    (value) =>
      !value.collect_email_for_analytics ||
      value.email_verification === true ||
      value.nda_gate === true ||
      value.dynamic_watermark_email === true,
    {
      message: "Email collection requires email verification or NDA gating",
      path: ["collect_email_for_analytics"],
    },
  )
  .refine((value) => !value.nda_gate || value.nda_template_id, {
    message: "NDA template is required when NDA gating is enabled",
    path: ["nda_template_id"],
  });

export type LinkSettingsInput = z.infer<typeof LinkSettingsSchema>;
