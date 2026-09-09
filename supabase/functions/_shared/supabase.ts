import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { HttpError } from "./http.ts";

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

export const createAdminClient = (): SupabaseClient => createClient(
  requiredEnv("SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export const bearerToken = (request: Request) => {
  const authorization = request.headers.get("Authorization") ?? "";
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new HttpError(401, "Authentication is required.", "authentication_required");
  }
  return token;
};

export const requireUser = async (request: Request): Promise<{ user: User; token: string }> => {
  const token = bearerToken(request);
  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Your session is no longer valid.", "invalid_session");
  return { user: data.user, token };
};

export const createUserClient = (token: string): SupabaseClient => createClient(
  requiredEnv("SUPABASE_URL"),
  requiredEnv("SUPABASE_ANON_KEY"),
  {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  },
);

export const featureFlagsForSession = async (token: string): Promise<Record<string, boolean>> => {
  const client = createUserClient(token);
  const { data, error } = await client.rpc("current_feature_flags");
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((entry: { key: string; enabled: boolean }) => [String(entry.key), Boolean(entry.enabled)]));
};

export const requireFeature = async (token: string, key: string): Promise<void> => {
  const flags = await featureFlagsForSession(token);
  if (!flags[key]) throw new HttpError(403, "This feature is not enabled for this account.", "feature_not_enabled");
};

export const requireActiveUser = async (userId: string): Promise<void> => {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { count, error } = await admin.from("user_sanctions").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("kind", "suspension").is("lifted_at", null)
    .lte("starts_at", now).gt("expires_at", now);
  if (error) throw error;
  if ((count ?? 0) > 0) throw new HttpError(403, "This account is temporarily restricted.", "account_restricted");
};

export const requireStaff = async (userId: string) => {
  const admin = createAdminClient();
  const { data, error } = await admin.from("user_roles").select("role").eq("user_id", userId).in("role", ["moderator", "admin"]);
  if (error || !data?.length) throw new HttpError(403, "A staff account is required.", "staff_required");
  return data.map((entry) => entry.role as string);
};
