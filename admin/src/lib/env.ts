// Read where Next.js inlines them: NEXT_PUBLIC_ values are replaced at build
// time only when written out in full like this.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseSettings = () => {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see admin/.env.example)."
    );
  }
  return { url: supabaseUrl, key: supabaseKey };
};

// Only the server reads the session -- the admin has no browser client -- so
// page scripts never see the cookie, and it travels only over HTTPS. Twelve
// hours after the last request, staff sign in again with their code.
export const sessionCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  maxAge: 12 * 60 * 60
};
