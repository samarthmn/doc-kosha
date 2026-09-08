import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env";

export const hasSupabaseAuthCookies = (request: NextRequest): boolean => {
  // Avoid an expensive Supabase round-trip for anonymous users.
  // We only refresh/revalidate sessions when auth cookies exist.
  try {
    const cookies = request.cookies.getAll();
    return cookies.some(({ name }) => {
      if (name === "supabase-auth-token") return true;
      if (!name.startsWith("sb-")) return false;
      return (
        name.includes("auth-token") ||
        name.includes("access-token") ||
        name.includes("refresh-token")
      );
    });
  } catch {
    // Fallback: inspect raw cookie header.
    const header = request.headers.get("cookie") || "";
    return (
      header.includes("supabase-auth-token") ||
      (header.includes("sb-") &&
        (header.includes("auth-token") ||
          header.includes("access-token") ||
          header.includes("refresh-token")))
    );
  }
};

export async function updateSession(
  request: NextRequest,
  requestHeaders: Headers = new Headers(request.headers),
): Promise<{ response: NextResponse; isAuthenticated: boolean }> {
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (!hasSupabaseAuthCookies(request)) {
    return { response, isAuthenticated: false };
  }

  const supabase = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(
          name: string,
          value: string,
          options?: Parameters<typeof response.cookies.set>[2],
        ) {
          response.cookies.set(name, value, options);
        },
        remove(
          name: string,
          options?: Parameters<typeof response.cookies.set>[2],
        ) {
          response.cookies.set(name, "", { ...options, maxAge: 0 });
        },
      },
    },
  );

  // This revalidates the auth token with Supabase and refreshes cookies if needed
  const { data, error } = await supabase.auth.getUser();
  const isAuthenticated = Boolean(error === null && data.user !== null);

  return { response, isAuthenticated };
}
