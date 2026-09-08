import type { NextRequest } from "next/server";
import { Address4, Address6 } from "ip-address";

export const extractClientIp = (req: NextRequest): string | null => {
  const normalize = (value: string | null | undefined): string | null => {
    if (!value) return null;
    let token = value.trim();
    if (!token) return null;
    // Forwarded header value may be quoted or include for=
    token = token.replace(/^for=/i, "").replace(/^"|"$/g, "");
    // Strip IPv6 zone index if present (e.g., %eth0)
    const percentIdx = token.indexOf("%");
    if (percentIdx !== -1) {
      token = token.slice(0, percentIdx);
    }
    // If IPv6 wrapped in [], remove brackets
    if (token.startsWith("[")) {
      const close = token.indexOf("]");
      if (close > 0) {
        token = token.slice(1, close);
      } else {
        token = token.slice(1).replace(/]$/, "");
      }
    }
    // Handle IPv4-mapped IPv6 (::ffff:x.x.x.x)
    if (token.toLowerCase().startsWith("::ffff:")) {
      token = token.slice(7);
    }
    // Validate using ip-address
    try {
      if (Address4.isValid(token)) {
        const addr = new Address4(token);
        return addr.correctForm();
      }
      if (Address6.isValid(token)) {
        const addr6 = new Address6(token);
        return addr6.correctForm();
      }
    } catch {
      // fall through
    }
    return null;
  };

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const segments = forwardedFor
      .split(",")
      .map((segment) => segment.trim())
      .filter(Boolean);
    for (const seg of segments) {
      const ip = normalize(seg);
      if (ip) return ip;
    }
  }

  const realIp = req.headers.get("x-real-ip");
  const ipFromReal = normalize(realIp);
  if (ipFromReal) return ipFromReal;

  const reqWithIp = req as unknown as { ip?: string | null };
  if (typeof reqWithIp.ip === "string") {
    const ip = normalize(reqWithIp.ip);
    if (ip) return ip;
  }

  return null;
};
