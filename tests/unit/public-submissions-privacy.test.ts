import assert from "node:assert/strict";
import test from "node:test";

import {
  publicFeedbackSubmissionSchema,
  publicQAAnswerSchema,
  publicQAQuestionSchema,
  sanitizePublicFeedbackSubmission,
} from "@/lib/validators/publicSubmissions";
import {
  PUBLIC_FEEDBACK_SUBMISSION_MAX_CHARS,
  PUBLIC_QA_ANSWER_MAX_CHARS,
  PUBLIC_QA_QUESTION_MAX_CHARS,
} from "@/lib/constants";

test("feedback omits viewer email when analytics email collection is disabled", () => {
  const sanitized = sanitizePublicFeedbackSubmission(
    {
      message: "Useful document",
      email: "viewer@example.com",
    },
    {
      collectEmailForAnalytics: false,
      verifiedEmail: "viewer@example.com",
    },
  );

  assert.deepEqual(sanitized, { message: "Useful document" });
});

test("feedback stores only the server-verified email when collection is enabled", () => {
  const sanitized = sanitizePublicFeedbackSubmission(
    {
      message: "Useful document",
      email: "spoofed@example.com",
    },
    {
      collectEmailForAnalytics: true,
      verifiedEmail: "Verified@Example.com",
    },
  );

  assert.deepEqual(sanitized, {
    message: "Useful document",
    email: "verified@example.com",
  });
});

test("public feedback and Q&A schemas reject oversized rows", () => {
  assert.equal(
    publicFeedbackSubmissionSchema.safeParse({
      message: "x".repeat(PUBLIC_FEEDBACK_SUBMISSION_MAX_CHARS),
    }).success,
    false,
  );
  assert.equal(
    publicQAQuestionSchema.safeParse(
      "x".repeat(PUBLIC_QA_QUESTION_MAX_CHARS + 1),
    ).success,
    false,
  );
  assert.equal(
    publicQAAnswerSchema.safeParse("x".repeat(PUBLIC_QA_ANSWER_MAX_CHARS + 1))
      .success,
    false,
  );
});
