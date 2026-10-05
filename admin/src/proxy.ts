import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieOptions, supabaseSettings } from "@/lib/env";

// Runs before every page: refreshes the staff member's session cookie, sends
// anyone signed out to the login page, and sets a Content-Security-Policy
// with a fresh script nonce. Whether a session is staff, and whether it has
// its second factor, is decided in the pages and in the database -- this is
// only the quick first check.
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const development = process.env.NODE_ENV === "development";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // The authenticator QR code arrives as a data: URI.
    "img-src 'self' data:",
    "font-src 'self'",
    // Lesson videos go from the browser straight to Mux's upload storage.
    `connect-src 'self' https://storage.googleapis.com${development ? " http://localhost:*" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"])
  ].join("; ");

  const refreshed: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const noStore: Record<string, string> = {};
  const { url, key } = supabaseSettings();
  const supabase = createServerClient(url, key, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value);
          refreshed.push(cookie);
        }
        Object.assign(noStore, headers);
      }
    }
  });
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const onLogin = request.nextUrl.pathname === "/login";
  const response = !signedIn && !onLogin
    ? NextResponse.redirect(new URL("/login", request.url))
    : NextResponse.next({ request: { headers: requestHeaders } });

  for (const { name, value, options } of refreshed) response.cookies.set(name, value, options);
  for (const [header, value] of Object.entries(noStore)) response.headers.set(header, value);
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // Next's own assets and dev connections carry no session and need no policy.
  matcher: ["/((?!_next/|favicon.ico|robots.txt).*)"]
};
