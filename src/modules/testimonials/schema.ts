import { z } from "zod";

export const testimonialSubmissionSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  roleTitle: z.string().trim().min(1, "Role or title is required").max(120),
  company: z.string().trim().min(1, "Company is required").max(160),
  testimonial: z
    .string()
    .trim()
    .min(20, "Please write at least 20 characters")
    .max(3000, "Please keep it under 3000 characters"),
});

export const testimonialActionSchema = testimonialSubmissionSchema.extend({
  headshotStoragePath: z.string().trim().min(1).max(1024).nullable(),
});

export type TestimonialSubmissionValues = z.infer<
  typeof testimonialSubmissionSchema
>;
export type TestimonialActionValues = z.infer<typeof testimonialActionSchema>;

export type TestimonialFieldErrors = Partial<
  Record<keyof TestimonialSubmissionValues, string>
>;
