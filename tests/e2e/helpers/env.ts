import { execSync } from "node:child_process";
import { z } from "zod";

type EnvMap = Record<string, string>;

const parseEnvOutput = (content: string): EnvMap => {
  const out: EnvMap = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eqIdx = normalized.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = normalized.slice(0, eqIdx).trim();
    const rawValue = normalized.slice(eqIdx + 1).trim();
    out[key] = rawValue.replace(/^["']|["']$/g, "");
  }
  return out;
};

const isLocalSupabaseUrl = (rawUrl: string | undefined): boolean => {
  if (!rawUrl) return true;
  try {
    const url = new URL(rawUrl);
    return ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname);
  } catch {
    return false;
  }
};

const loadLocalSupabaseEnv = (): void => {
  if (!isLocalSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)) return;

  try {
    const output = execSync("supabase status -o env", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
    });
    const parsed = parseEnvOutput(output);

    if (parsed.API_URL) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = parsed.API_URL;
    }
    if (parsed.ANON_KEY) {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = parsed.ANON_KEY;
    }
    if (parsed.SERVICE_ROLE_KEY) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = parsed.SERVICE_ROLE_KEY;
    }
    if (!process.env.MAILPIT_BASE_URL) {
      process.env.MAILPIT_BASE_URL = parsed.MAILPIT_URL ?? parsed.INBUCKET_URL;
    }
  } catch {
    console.warn(
      "[e2e/env] Could not load local Supabase credentials. Start Supabase or provide env vars.",
    );
  }
};

const validateServiceRoleKey = (key: string): void => {
  if (key.startsWith("sb_secret_") || key.split(".").length !== 3) {
    throw new Error(
      "[e2e/env] SUPABASE_SERVICE_ROLE_KEY must be the JWT service_role key from `supabase status`.",
    );
  }
};

const E2EEnvSchema = z.object({
  PLAYWRIGHT_BASE_URL: z.string().url().default("http://localhost:3000"),
  MAILPIT_BASE_URL: z.string().url().default("http://localhost:54324"),
  SMTP_HOST: z.string().default("127.0.0.1"),
  SMTP_PORT: z.string().default("54325"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  R2_ENDPOINT: z.string().url().default("http://localhost:9000"),
});

type E2EEnv = z.infer<typeof E2EEnvSchema>;

let cached: E2EEnv | null = null;

export const getE2EEnv = (): E2EEnv => {
  if (cached) return cached;

  loadLocalSupabaseEnv();

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    validateServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  cached = E2EEnvSchema.parse({
    PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL,
    MAILPIT_BASE_URL: process.env.MAILPIT_BASE_URL,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    R2_ENDPOINT: process.env.R2_ENDPOINT,
  });

  return cached;
};
