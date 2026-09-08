import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clientEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { claimEmailDelivery, sendClaimedEmail } from "@/server/emailDeliveries";
import { buildLoginNewDeviceEmail } from "@/server/emails/templates";
import { getOrCreateNotificationPreferences } from "@/server/notificationPreferences";
import { resolveLoginActivityCountryCode } from "@/server/loginActivityCountry";
import { processLogger } from "@/server/processLogger";

const DEVICE_COOKIE_NAME = "dk_auth_device_id";
const OCCURRED_AT_FALLBACK_WINDOW_MS = 10 * 60 * 1000;

const RequestSchema = z.object({
  occurredAt: z.string().datetime().optional(),
});

const hashUserAgent = (userAgent: string): string =>
  createHash("sha256").update(userAgent).digest("hex");

const inferDeviceLabel = (userAgent: string): string => {
  const normalized = userAgent.toLowerCase();

  const browser = (() => {
    if (normalized.includes("edg/")) return "Edge";
    if (normalized.includes("chrome/")) return "Chrome";
    if (normalized.includes("safari/") && !normalized.includes("chrome/")) {
      return "Safari";
    }
    if (normalized.includes("firefox/")) return "Firefox";
    return "Browser";
  })();

  const os = (() => {
    if (normalized.includes("windows")) return "Windows";
    if (normalized.includes("mac os x")) return "macOS";
    if (normalized.includes("iphone") || normalized.includes("ipad")) {
      return "iOS";
    }
    if (normalized.includes("android")) return "Android";
    if (normalized.includes("linux")) return "Linux";
    return "Unknown OS";
  })();

  return `${browser} on ${os}`;
};

const parseDeviceIdCookie = (value: string | undefined): string | null => {
  if (!value) return null;
  return z.string().uuid().safeParse(value).success ? value : null;
};

const resolveOccurredAtIso = (value: string | undefined): string => {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  const now = Date.now();
  if (Math.abs(now - parsed.getTime()) > OCCURRED_AT_FALLBACK_WINDOW_MS) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsedBody = RequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id || !user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseServiceClient();
    const preferences = await getOrCreateNotificationPreferences(user.id);

    const occurredAt = resolveOccurredAtIso(parsedBody.data.occurredAt);
    const userAgent = req.headers.get("user-agent")?.trim() ?? "unknown";
    const deviceLabel = inferDeviceLabel(userAgent);
    const uaHash = hashUserAgent(userAgent);
    const countryCode = resolveLoginActivityCountryCode(req.headers);

    const existingDeviceId = parseDeviceIdCookie(
      req.cookies.get(DEVICE_COOKIE_NAME)?.value,
    );
    const resolvedDeviceId = existingDeviceId ?? randomUUID();
    const nowIso = new Date().toISOString();
    const { data: existingDevices, error: existingDevicesError } = await admin
      .from("user_known_devices")
      .select("device_id")
      .eq("user_id", user.id)
      .limit(1);
    const existingDevicesLoadFailed = Boolean(existingDevicesError);
    if (existingDevicesLoadFailed) {
      processLogger.warn("[login-activity] failed to load existing devices", {
        userId: user.id,
        existingDevicesError,
      });
    }
    const hasExistingKnownDevice = existingDevicesLoadFailed
      ? false
      : (existingDevices ?? []).length > 0;

    const { data: knownDevice, error: knownDeviceError } = await admin
      .from("user_known_devices")
      .select("device_id")
      .eq("user_id", user.id)
      .eq("device_id", resolvedDeviceId)
      .maybeSingle();

    if (knownDeviceError) {
      console.error("[login-activity] failed to load known device", {
        userId: user.id,
        deviceId: resolvedDeviceId,
        knownDeviceError,
      });
    }

    const isNewDevice = !knownDevice;
    if (isNewDevice) {
      const { error: insertError } = await admin
        .from("user_known_devices")
        .insert({
          user_id: user.id,
          device_id: resolvedDeviceId,
          first_seen_at: nowIso,
          last_seen_at: nowIso,
          device_label: deviceLabel,
          ua_hash: uaHash,
          last_country_code: countryCode,
        });
      if (insertError) {
        console.error("[login-activity] failed to insert known device", {
          userId: user.id,
          deviceId: resolvedDeviceId,
          insertError,
        });
      }
    } else {
      const { error: updateError } = await admin
        .from("user_known_devices")
        .update({
          last_seen_at: nowIso,
          device_label: deviceLabel,
          ua_hash: uaHash,
          last_country_code: countryCode,
        })
        .eq("user_id", user.id)
        .eq("device_id", resolvedDeviceId);
      if (updateError) {
        console.error("[login-activity] failed to update known device", {
          userId: user.id,
          deviceId: resolvedDeviceId,
          updateError,
        });
      }
    }

    const settingsUrl = `${clientEnv.NEXT_PUBLIC_APP_URL}/settings?tab=notifications`;
    if (
      isNewDevice &&
      hasExistingKnownDevice &&
      preferences.securityLoginAlertsEnabled
    ) {
      const claim = await claimEmailDelivery({
        template: "login-new-device",
        toEmail: user.email,
        userId: user.id,
        dedupeKey: `login-new-device:${user.id}:${resolvedDeviceId}`,
      });
      if (claim.claimed) {
        const email = buildLoginNewDeviceEmail({
          occurredAt,
          deviceLabel,
          countryCode,
          settingsUrl,
        });
        await sendClaimedEmail({
          id: claim.id,
          claimToken: claim.token,
          toEmail: user.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
      }
    }

    const response = NextResponse.json({
      ok: true,
      newDevice: isNewDevice,
    });
    if (!existingDeviceId) {
      response.cookies.set(DEVICE_COOKIE_NAME, resolvedDeviceId, {
        httpOnly: true,
        sameSite: "lax",
        secure: clientEnv.NEXT_PUBLIC_APP_URL.startsWith("https://"),
        path: "/",
        maxAge: 60 * 60 * 24 * 400,
      });
    }

    return response;
  } catch (error) {
    console.error("[login-activity] unexpected error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
