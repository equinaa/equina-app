import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sessionCookieOptions, supabaseSettings } from "@/lib/env";

// One client per request, acting as the signed-in staff member. There is no
// service-role client anywhere in the admin: what staff may do is decided by
// the database, with their own session.
export const createClient = async () => {
  const cookieStore = await cookies();
  const { url, key } = supabaseSettings();
  return createServerClient(url, key, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Rendering a Server Component cannot set cookies. The proxy has
          // already refreshed the session for this request, so nothing is lost.
        }
      }
    }
  });
};
