import { z } from "zod";
import {
  PUBLIC_FEEDBACK_SUBMISSION_MAX_CHARS,
  PUBLIC_QA_ANSWER_MAX_CHARS,
  PUBLIC_QA_QUESTION_MAX_CHARS,
} from "@/lib/constants";

const isBoundedJson = (value: unknown): boolean => {
  try {
    const serialized = JSON.stringify(value);
    return (
      typeof serialized === "string" &&
      serialized.length <= PUBLIC_FEEDBACK_SUBMISSION_MAX_CHARS
    );
  } catch {
    return false;
  }
};

export const publicFeedbackSubmissionSchema = z
  .unknown()
  .refine(isBoundedJson, { message: "Feedback submission is too large" });

export const publicQAQuestionSchema = z
  .string()
  .trim()
  .min(1)
  .max(PUBLIC_QA_QUESTION_MAX_CHARS);

export const publicQAAnswerSchema = z
  .string()
  .trim()
  .max(PUBLIC_QA_ANSWER_MAX_CHARS);

export const sanitizePublicFeedbackSubmission = (
  submission: unknown,
  options: {
    collectEmailForAnalytics: boolean;
    verifiedEmail: string | null;
  },
): unknown => {
  const parsedRecord = z.record(z.string(), z.unknown()).safeParse(submission);
  if (!parsedRecord.success) return submission;

  const withoutEmail = Object.fromEntries(
    Object.entries(parsedRecord.data).filter(([key]) => key !== "email"),
  );

  if (!options.collectEmailForAnalytics || !options.verifiedEmail) {
    return withoutEmail;
  }

  return {
    ...withoutEmail,
    email: options.verifiedEmail.trim().toLowerCase(),
  };
};
