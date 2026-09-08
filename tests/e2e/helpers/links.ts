import {
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { seedDeniedAnalyticsConsentCookie } from "./cookies";
import { getNewestMailpitMessageId, waitForOtpCode } from "./mailpit";

export const resolvePublicDocumentLink = async (args: {
  request: APIRequestContext;
  linkId: string;
  documentId: string;
  password?: string;
}): Promise<number> => {
  const res = await args.request.post("/api/public/links/resolve", {
    data: {
      linkId: args.linkId,
      documentId: args.documentId,
      password: args.password,
    },
  });
  return res.status();
};

export const verifyPublicDocumentEmail = async (args: {
  request: APIRequestContext;
  linkId: string;
  documentId: string;
  email: string;
}): Promise<void> => {
  const baselineMessageId = await getNewestMailpitMessageId({
    to: args.email,
    subjectIncludes: "Verification Code",
  });
  const sinceMs = Date.now();
  const send = await args.request.post("/api/public/links/otp", {
    data: {
      action: "send",
      linkId: args.linkId,
      documentId: args.documentId,
      email: args.email,
    },
  });
  expect(send.status()).toBe(200);

  const code = await waitForOtpCode({
    to: args.email,
    sinceMs,
    subjectIncludes: "Verification Code",
    baselineMessageId,
  });
  const verify = await args.request.post("/api/public/links/otp", {
    data: {
      action: "verify",
      linkId: args.linkId,
      documentId: args.documentId,
      email: args.email,
      code,
    },
  });
  expect(verify.status()).toBe(200);
};

export const openPublicDocumentViewer = async (args: {
  context: BrowserContext;
  shareUrl: string;
  password?: string;
  email?: string;
}): Promise<Page> => {
  const page = await args.context.newPage();
  await page.context().clearCookies();
  await seedDeniedAnalyticsConsentCookie(page.context());
  await page.goto(args.shareUrl, { waitUntil: "domcontentloaded" });

  const viewerEmail =
    args.email ??
    `viewer+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  let otpRequestedAt: number | null = null;
  let otpBaselineMessageId: string | null = null;
  let otpCode: string | null = null;
  let otpSubmitted = false;
  let lastState = "initial";

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (
      await page
        .locator('[data-dk-pdf-state="ready"]')
        .isVisible()
        .catch(() => false)
    ) {
      return page;
    }

    const passwordInput = page
      .locator('input[type="password"], input[aria-label="Access password"]')
      .first();
    if (await passwordInput.isVisible().catch(() => false)) {
      lastState = "password";
      await passwordInput.fill(args.password ?? "");
      await page.getByRole("button", { name: "Unlock" }).click();
      continue;
    }

    const otpInput = page
      .locator(
        'input[autocomplete="one-time-code"], input[aria-label="Verification code"]',
      )
      .first();
    if (await otpInput.isVisible().catch(() => false)) {
      if (otpSubmitted) {
        // Verification is in flight; the gate either releases or the deadline
        // error below reports this state.
        lastState = "otp-verifying";
        await page.waitForTimeout(500);
        continue;
      }
      if (!(await otpInput.isEnabled().catch(() => false))) {
        lastState = "otp-disabled";
        await page.waitForTimeout(500);
        continue;
      }
      if (!otpRequestedAt)
        throw new Error("OTP input appeared before send step");
      lastState = "otp";
      otpCode ??= await waitForOtpCode({
        to: viewerEmail,
        sinceMs: otpRequestedAt,
        subjectIncludes: "Verification Code",
        baselineMessageId: otpBaselineMessageId,
      });
      await otpInput.fill(otpCode, { timeout: 5_000 });
      const verifyButton = page.getByRole("button", { name: "Verify" });
      await expect(verifyButton).toBeEnabled();
      await verifyButton.click();
      otpSubmitted = true;
      continue;
    }

    const emailInput = page
      .locator('input[type="email"], input[aria-label="Email address"]')
      .first();
    if (
      (await emailInput.isVisible().catch(() => false)) &&
      (await emailInput.isEnabled().catch(() => false))
    ) {
      lastState = "email";
      otpBaselineMessageId = await getNewestMailpitMessageId({
        to: viewerEmail,
        subjectIncludes: "Verification Code",
      });
      otpRequestedAt = Date.now();
      await emailInput.fill(viewerEmail);
      await page.getByRole("button", { name: "Send code" }).click();
      continue;
    }

    lastState = "waiting-viewer";
    await page.waitForTimeout(1000);
  }

  throw new Error(
    `Public document viewer did not open (last gate state: ${lastState}). Current URL: ${page.url()}`,
  );
};

export const postPublicEvent = async (args: {
  request: APIRequestContext;
  linkId: string;
  documentId: string;
  event: "view" | "download" | "page_view" | "section_time";
  sessionId: string;
  durationMs?: number;
  pageNumber?: number;
  sectionOffset?: number;
}): Promise<void> => {
  const res = await args.request.post("/api/public/events", {
    data: {
      kind: "event",
      linkId: args.linkId,
      resourceId: args.documentId,
      resourceType: "document",
      documentId: args.documentId,
      event: args.event,
      sessionId: args.sessionId,
      durationMs: args.durationMs,
      pageNumber: args.pageNumber,
      sectionOffset: args.sectionOffset,
    },
  });
  expect(res.status()).toBe(200);
};

export const postFeedback = async (args: {
  request: APIRequestContext;
  linkId: string;
  documentId: string;
  message: string;
  email?: string | null;
}): Promise<void> => {
  const res = await args.request.post("/api/public/events", {
    data: {
      kind: "feedback",
      linkId: args.linkId,
      resourceId: args.documentId,
      resourceType: "document",
      submission: { message: args.message, email: args.email ?? undefined },
    },
  });
  expect(res.status()).toBe(200);
};

export const postQuestion = async (args: {
  request: APIRequestContext;
  linkId: string;
  documentId: string;
  question: string;
}): Promise<void> => {
  const res = await args.request.post("/api/public/events", {
    data: {
      kind: "qa",
      linkId: args.linkId,
      resourceId: args.documentId,
      resourceType: "document",
      question: args.question,
    },
  });
  expect(res.status()).toBe(200);
};
