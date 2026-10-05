import "server-only";

// Edge functions answer a refusal with { error, code }, written for people.
// supabase-js wraps it in an error whose context is the raw response.
export const edgeMessage = async (error: unknown, fallback: string) => {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as { error?: unknown };
      if (typeof body.error === "string" && body.error.trim()) return body.error;
    } catch {
      // Not JSON: fall back to the generic message.
    }
  }
  return fallback;
};
