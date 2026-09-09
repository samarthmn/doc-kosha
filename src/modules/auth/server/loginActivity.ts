import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { resolveLoginActivityCountryCode } from "@/server/loginActivityCountry";

const identitySchema = z.object({
  sub: z.string().uuid(),
  session_id: z.string().uuid(),
});
const inferDeviceLabel = (userAgent: string): string => {
  const ua = userAgent.toLowerCase();
  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("firefox/")
      ? "Firefox"
      : ua.includes("chrome/")
        ? "Chrome"
        : ua.includes("safari/")
          ? "Safari"
          : "Browser";
  const os =
    ua.includes("iphone") || ua.includes("ipad")
      ? "iOS"
      : ua.includes("android")
        ? "Android"
        : ua.includes("windows")
          ? "Windows"
          : ua.includes("mac os x")
            ? "macOS"
            : ua.includes("linux")
              ? "Linux"
              : "Unknown OS";
  return `${browser} on ${os}`;
};

export async function enrichLoginActivity(
  headers: Headers,
): Promise<{ userId: string; sessionId: string } | null> {
  const authorization = headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  if (!token || token.length > 16384) return null;
  const supabase = await createSupabaseServerClient();
  const { data: verified, error: claimsError } =
    await supabase.auth.getClaims(token);
  if (claimsError) return null;
  const identity = identitySchema.safeParse(verified?.claims);
  if (!identity.success) return null;
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);
  if (userError || user?.id !== identity.data.sub) return null;
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin.rpc("enrich_login_session_event", {
    p_user_id: identity.data.sub,
    p_session_id: identity.data.session_id,
    p_device_label: inferDeviceLabel(headers.get("user-agent") ?? ""),
    p_country_code: resolveLoginActivityCountryCode(headers) ?? undefined,
  });
  if (error) throw error;
  return data
    ? { userId: identity.data.sub, sessionId: identity.data.session_id }
    : null;
}
