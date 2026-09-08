import { z } from "zod";

const booleanFromEnv = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const normalized = value.trim().toLowerCase();
    if (normalized === "1") return "true";
    if (normalized === "0") return "false";
    return normalized;
  },
  z.enum(["true", "false"]).transform((value) => value === "true"),
);

const optionalNonEmptyStringFromEnv = z.preprocess((value) => {
  if (value == null) return undefined;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().min(1).optional());

const optionalCloudflareOriginSecretFromEnv = z.preprocess((value) => {
  if (value == null) return undefined;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().min(32).optional());

const optionalUrlFromEnv = z.preprocess((value) => {
  if (value == null) return undefined;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().url().optional());

const smtpPortFromEnv = z
  .preprocess((value) => {
    if (value == null) return undefined;
    if (typeof value === "string" && value.trim().length === 0)
      return undefined;
    return value;
  }, z.coerce.number().int().min(1).max(65535))
  .default(54325);

const optionalMillisecondsFromEnv = z.preprocess((value) => {
  if (value == null) return undefined;
  if (typeof value === "string" && value.trim().length === 0) return undefined;
  return value;
}, z.coerce.number().int().min(0).optional());

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_APP_ENV: z.enum(["local", "staging", "production"]),
  NEXT_PUBLIC_ENABLE_PRODUCT_GUIDES: booleanFromEnv.optional().default(false),
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().min(1),
  NEXT_PUBLIC_GA_MEASUREMENT_ID: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_ADS_ID: z.string().optional(),
  NEXT_PUBLIC_LINKEDIN_PARTNER_ID: z.string().optional(),
  NEXT_PUBLIC_APOLLO_TRACKER_APP_ID: z.string().optional(),
  NEXT_PUBLIC_META_PIXEL_ID: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: optionalUrlFromEnv,
  // Product analytics (authenticated-only)
  NEXT_PUBLIC_POSTHOG_KEY: optionalNonEmptyStringFromEnv,
  // Can be absolute (e.g. https://s.dockosha.com) or relative (/ingest).
  // /ingest is only necessary when you want to route analytics requests through the app rewrites.
  NEXT_PUBLIC_POSTHOG_HOST: optionalNonEmptyStringFromEnv,
});

export const clientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV?.toLowerCase(),
  NEXT_PUBLIC_ENABLE_PRODUCT_GUIDES:
    process.env.NEXT_PUBLIC_ENABLE_PRODUCT_GUIDES,
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  NEXT_PUBLIC_GOOGLE_ADS_ID: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
  NEXT_PUBLIC_LINKEDIN_PARTNER_ID: process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID,
  NEXT_PUBLIC_APOLLO_TRACKER_APP_ID:
    process.env.NEXT_PUBLIC_APOLLO_TRACKER_APP_ID,
  NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
});

// Server-only env for backend services
const serverEnvSchema = z
  .object({
    // Supabase service role key (server-only)
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

    // Cloudflare R2 Storage (S3-compatible)
    R2_ENDPOINT: z.string().url(),
    R2_REGION: z.string().min(1).default("auto"),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET: z.string().min(1).default("dockosha"),

    // Stripe
    STRIPE_MODE: z
      .enum(["local", "staging", "production", "test", "live"])
      .default("local"),
    STRIPE_SECRET_KEY: optionalNonEmptyStringFromEnv,
    STRIPE_WEBHOOK_SECRET: optionalNonEmptyStringFromEnv,

    // SMTP credentials (ZeptoMail in production; Supabase Mailpit/Inbucket locally)
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: smtpPortFromEnv,
    SMTP_USER: optionalNonEmptyStringFromEnv,
    SMTP_PASS: optionalNonEmptyStringFromEnv,
    SENDER_EMAIL: z.string().email(),
    NOTIFICATION_SENDER_EMAIL: z.string().email(),
    FOUNDER_SENDER_EMAIL: z.string().email(),
    LIFECYCLE_PROCESSOR_SECRET: optionalNonEmptyStringFromEnv,
    LIFECYCLE_DELAY_SETUP_INCOMPLETE_1H_MS: optionalMillisecondsFromEnv,
    LIFECYCLE_DELAY_SETUP_INCOMPLETE_2D_MS: optionalMillisecondsFromEnv,
    LIFECYCLE_DELAY_FOUNDER_HELP_DAY_1_MS: optionalMillisecondsFromEnv,
    LIFECYCLE_DELAY_TRIAL_ENDING_OFFSET_MS: optionalMillisecondsFromEnv,
    LIFECYCLE_INACTIVITY_THRESHOLD_MS: optionalMillisecondsFromEnv,
    LIFECYCLE_RECENT_NUDGE_WINDOW_MS: optionalMillisecondsFromEnv,

    // Cookie secret for signed HTTPOnly cookies (OTP verification)
    COOKIE_SECRET: z.string().min(32),
    // Dedicated secret for deterministic comment author identity hashing
    COMMENTS_AUTHOR_SECRET: z.string().min(32).optional(),

    // Sentry (server-only)
    SENTRY_DSN: optionalUrlFromEnv,

    // Cloudflare Custom Hostnames (for SaaS custom domain provisioning).
    // These are optional at application boot; custom-domain operations validate
    // the complete integration before making provider or database changes.
    CLOUDFLARE_API_TOKEN: optionalNonEmptyStringFromEnv,
    CLOUDFLARE_ZONE_ID: optionalNonEmptyStringFromEnv,
    CLOUDFLARE_CUSTOM_HOSTNAME_FALLBACK_ORIGIN: optionalNonEmptyStringFromEnv,
    CLOUDFLARE_WORKER_ORIGIN_SECRET: optionalCloudflareOriginSecretFromEnv,
  })
  .superRefine((env, ctx) => {
    const hasUser =
      typeof env.SMTP_USER === "string" && env.SMTP_USER.length > 0;
    const hasPass =
      typeof env.SMTP_PASS === "string" && env.SMTP_PASS.length > 0;

    if (hasUser !== hasPass) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "SMTP_USER and SMTP_PASS must be set together (or both unset).",
        path: ["SMTP_USER"],
      });
    }

    // In non-local environments we expect authenticated SMTP.
    if (clientEnv.NEXT_PUBLIC_APP_ENV !== "local" && (!hasUser || !hasPass)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "SMTP_USER/SMTP_PASS are required when NEXT_PUBLIC_APP_ENV is not local.",
        path: ["SMTP_USER"],
      });
    }
  });

export const serverEnv = (() => {
  // Avoid parsing server-only env in the browser bundle
  if (typeof window !== "undefined") {
    return new Proxy(
      {},
      {
        get() {
          throw new Error("serverEnv accessed on the client");
        },
      },
    );
  }

  return serverEnvSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

    R2_ENDPOINT: process.env.R2_ENDPOINT,
    R2_REGION: process.env.R2_REGION,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: process.env.R2_BUCKET,

    STRIPE_MODE: process.env.STRIPE_MODE?.toLowerCase(),
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,

    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SENDER_EMAIL: process.env.SENDER_EMAIL,
    NOTIFICATION_SENDER_EMAIL: process.env.NOTIFICATION_SENDER_EMAIL,
    FOUNDER_SENDER_EMAIL: process.env.FOUNDER_SENDER_EMAIL,
    LIFECYCLE_PROCESSOR_SECRET: process.env.LIFECYCLE_PROCESSOR_SECRET,
    LIFECYCLE_DELAY_SETUP_INCOMPLETE_1H_MS:
      process.env.LIFECYCLE_DELAY_SETUP_INCOMPLETE_1H_MS,
    LIFECYCLE_DELAY_SETUP_INCOMPLETE_2D_MS:
      process.env.LIFECYCLE_DELAY_SETUP_INCOMPLETE_2D_MS,
    LIFECYCLE_DELAY_FOUNDER_HELP_DAY_1_MS:
      process.env.LIFECYCLE_DELAY_FOUNDER_HELP_DAY_1_MS,
    LIFECYCLE_DELAY_TRIAL_ENDING_OFFSET_MS:
      process.env.LIFECYCLE_DELAY_TRIAL_ENDING_OFFSET_MS,
    LIFECYCLE_INACTIVITY_THRESHOLD_MS:
      process.env.LIFECYCLE_INACTIVITY_THRESHOLD_MS,
    LIFECYCLE_RECENT_NUDGE_WINDOW_MS:
      process.env.LIFECYCLE_RECENT_NUDGE_WINDOW_MS,

    COOKIE_SECRET: process.env.COOKIE_SECRET,
    COMMENTS_AUTHOR_SECRET: process.env.COMMENTS_AUTHOR_SECRET,

    SENTRY_DSN: process.env.SENTRY_DSN,

    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ZONE_ID: process.env.CLOUDFLARE_ZONE_ID,
    CLOUDFLARE_CUSTOM_HOSTNAME_FALLBACK_ORIGIN:
      process.env.CLOUDFLARE_CUSTOM_HOSTNAME_FALLBACK_ORIGIN,
    CLOUDFLARE_WORKER_ORIGIN_SECRET:
      process.env.CLOUDFLARE_WORKER_ORIGIN_SECRET,
  });
})() as z.infer<typeof serverEnvSchema>;
