import bcrypt from "bcryptjs";
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
} from "@playwright/test";
import {
  getAuthUserIdByEmail,
  insertDocumentFixture,
  insertLink,
  type DocumentRow,
} from "./helpers/db";
import { waitForOtpCode } from "./helpers/mailpit";
import { provisionCoreWorkspace } from "./helpers/provision";
import { uniqueEmail, uniqueName } from "./helpers/random";

const INVALID_OTP_BODY = { error: "Invalid or expired code" };
const TOO_MANY_REQUESTS_BODY = { error: "Too many requests" };

const postOtp = async (
  request: APIRequestContext,
  data: {
    action: "send" | "verify";
    linkId: string;
    documentId: string;
    email: string;
    code?: string;
  },
) =>
  await request.post("/api/public/links/otp", {
    data,
  });

test.describe("Public authentication rate limiting @core", () => {
  test.setTimeout(240_000);

  let provisioningContext: BrowserContext;
  let workspaceId: string;
  let ownerUserId: string;
  let document: DocumentRow;

  test.beforeAll(async ({ browser }) => {
    provisioningContext = await browser.newContext();
    const page = await provisioningContext.newPage();
    const provisioned = await provisionCoreWorkspace(page);
    workspaceId = provisioned.workspaceId;
    ownerUserId = await getAuthUserIdByEmail(provisioned.email);
    document = await insertDocumentFixture({
      workspaceId,
      createdBy: ownerUserId,
      title: uniqueName("Rate limit fixture.pdf"),
      storagePath: `${workspaceId}/rate-limit/${Date.now()}.pdf`,
    });
  });

  test.afterAll(async () => {
    await provisioningContext?.close();
  });

  test("OTP lockout is generic and isolated by email", async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const link = await insertLink({
        workspace_id: workspaceId,
        document_id: document.id,
        created_by: ownerUserId,
        name: uniqueName("OTP lockout link"),
        email_verification: true,
        curated_qas: [],
      });
      const lockedEmail = uniqueEmail("rate-limit-otp-locked");
      const sentAt = Date.now();
      const send = await postOtp(context.request, {
        action: "send",
        linkId: link.id,
        documentId: document.id,
        email: lockedEmail,
      });
      expect(send.status()).toBe(200);
      const code = await waitForOtpCode({
        to: lockedEmail,
        sinceMs: sentAt,
        subjectIncludes: "Verification Code",
      });

      let firstWrongBody = "";
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const wrong = await postOtp(context.request, {
          action: "verify",
          linkId: link.id,
          documentId: document.id,
          email: lockedEmail,
          code: "000000",
        });
        const body = await wrong.text();
        expect(wrong.status(), `wrong OTP attempt ${attempt}`).toBe(401);
        expect(JSON.parse(body)).toEqual(INVALID_OTP_BODY);
        if (attempt === 1) firstWrongBody = body;
        expect(body).toBe(firstWrongBody);
      }

      const lockedCorrect = await postOtp(context.request, {
        action: "verify",
        linkId: link.id,
        documentId: document.id,
        email: lockedEmail,
        code,
      });
      const lockedCorrectBody = await lockedCorrect.text();
      expect(lockedCorrect.status()).toBe(401);
      expect(JSON.parse(lockedCorrectBody)).toEqual(INVALID_OTP_BODY);
      expect(lockedCorrectBody).toBe(firstWrongBody);

      const isolatedEmail = uniqueEmail("rate-limit-otp-isolated");
      const isolatedSentAt = Date.now();
      const isolatedSend = await postOtp(context.request, {
        action: "send",
        linkId: link.id,
        documentId: document.id,
        email: isolatedEmail,
      });
      expect(isolatedSend.status()).toBe(200);
      const isolatedCode = await waitForOtpCode({
        to: isolatedEmail,
        sinceMs: isolatedSentAt,
        subjectIncludes: "Verification Code",
      });
      const isolatedVerify = await postOtp(context.request, {
        action: "verify",
        linkId: link.id,
        documentId: document.id,
        email: isolatedEmail,
        code: isolatedCode,
      });
      expect(isolatedVerify.status()).toBe(200);
    } finally {
      await context.close();
    }
  });

  test("password lockout is generic and isolated by link", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    try {
      const password = "rate-limit-password";
      const passwordHash = await bcrypt.hash(password, 10);
      const lockedLink = await insertLink({
        workspace_id: workspaceId,
        document_id: document.id,
        created_by: ownerUserId,
        name: uniqueName("Password lockout link"),
        password_hash: passwordHash,
        curated_qas: [],
      });
      const isolatedLink = await insertLink({
        workspace_id: workspaceId,
        document_id: document.id,
        created_by: ownerUserId,
        name: uniqueName("Password isolated link"),
        password_hash: passwordHash,
        curated_qas: [],
      });

      let firstWrongBody = "";
      for (let attempt = 1; attempt <= 50; attempt += 1) {
        const wrong = await context.request.post("/api/public/links/resolve", {
          data: {
            linkId: lockedLink.id,
            documentId: document.id,
            password: "wrong-password",
          },
        });
        const body = await wrong.text();
        expect(wrong.status(), `wrong password attempt ${attempt}`).toBe(401);
        expect(JSON.parse(body)).toEqual({
          error: "Incorrect password",
          code: "BAD_PASSWORD",
          public_language: "en",
        });
        if (attempt === 1) firstWrongBody = body;
        expect(body).toBe(firstWrongBody);
      }

      // Budget exhausted by FAILURES: a further wrong attempt is rejected with
      // the identical body, so the limiter is still not an oracle.
      const exhaustedWrong = await context.request.post(
        "/api/public/links/resolve",
        {
          data: {
            linkId: lockedLink.id,
            documentId: document.id,
            password: "wrong-password",
          },
        },
      );
      expect(exhaustedWrong.status()).toBe(401);
      expect(await exhaustedWrong.text()).toBe(firstWrongBody);

      const isolatedCorrect = await context.request.post(
        "/api/public/links/resolve",
        {
          data: {
            linkId: isolatedLink.id,
            documentId: document.id,
            password,
          },
        },
      );
      expect(isolatedCorrect.status()).toBe(200);
    } finally {
      await context.close();
    }
  });

  test("OTP sends are capped per link and email", async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const link = await insertLink({
        workspace_id: workspaceId,
        document_id: document.id,
        created_by: ownerUserId,
        name: uniqueName("OTP send cap link"),
        email_verification: true,
        curated_qas: [],
      });
      const cappedEmail = uniqueEmail("rate-limit-send-capped");

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const send = await postOtp(context.request, {
          action: "send",
          linkId: link.id,
          documentId: document.id,
          email: cappedEmail,
        });
        expect(send.status(), `OTP send attempt ${attempt}`).toBe(200);
      }

      const capped = await postOtp(context.request, {
        action: "send",
        linkId: link.id,
        documentId: document.id,
        email: cappedEmail,
      });
      expect(capped.status()).toBe(429);
      expect(await capped.json()).toEqual(TOO_MANY_REQUESTS_BODY);

      const isolatedSend = await postOtp(context.request, {
        action: "send",
        linkId: link.id,
        documentId: document.id,
        email: uniqueEmail("rate-limit-send-isolated"),
      });
      expect(isolatedSend.status()).toBe(200);
    } finally {
      await context.close();
    }
  });
});
