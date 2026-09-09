import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import { backendError } from "./errors";

export type AuthProvider = "apple" | "google";

export class AuthRepository {
  constructor(private readonly client: SupabaseClient) {}

  private validatePassword(password: string) {
    if (password.length < 10 || password.length > 128) {
      throw backendError(new Error("Password length is invalid."), "Use between 10 and 128 characters.");
    }
  }

  async session(): Promise<Session | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw backendError(error, "Session could not be restored.");
    return data.session;
  }

  async sendEmailCode(
    email: string,
    displayName?: string,
    shouldCreateUser = true,
    redirectTo?: string
  ): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser,
        emailRedirectTo: redirectTo,
        data: { display_name: displayName?.trim() || undefined, locale: "en" }
      }
    });
    if (error) throw backendError(error, "Sign-in code could not be sent.");
  }

  async verifyEmailCode(email: string, code: string): Promise<Session> {
    const { data, error } = await this.client.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
    if (error || !data.session) throw backendError(error, "That sign-in code is invalid or expired.");
    return data.session;
  }

  async signUpWithPassword(input: {
    email: string;
    password: string;
    displayName?: string;
    redirectTo?: string;
  }): Promise<Session | null> {
    this.validatePassword(input.password);
    const { data, error } = await this.client.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: {
        emailRedirectTo: input.redirectTo,
        data: {
          display_name: input.displayName?.trim() || undefined,
          locale: "en"
        }
      }
    });
    if (error) throw backendError(error, "Your account could not be created.");
    if (!data.user) throw backendError(new Error("Account was not returned."), "Your account could not be created.");
    return data.session;
  }

  async signInWithPassword(email: string, password: string): Promise<Session> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    });
    if (error || !data.session) {
      throw backendError(error, "The email or password is incorrect.");
    }
    return data.session;
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo }
    );
    if (error) throw backendError(error, "Password recovery email could not be sent.");
  }

  async beginOAuth(provider: AuthProvider, redirectTo: string): Promise<string> {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: provider === "google" ? { prompt: "select_account" } : undefined
      }
    });
    if (error || !data.url) throw backendError(error, `${provider === "apple" ? "Apple" : "Google"} sign-in could not start.`);
    return data.url;
  }

  async exchangeOAuthCode(code: string): Promise<Session> {
    const { data, error } = await this.client.auth.exchangeCodeForSession(code);
    if (error || !data.session) throw backendError(error, "Social sign-in could not be completed.");
    return data.session;
  }

  async exchangeEmailLink(url: string): Promise<Session> {
    const callback = new URL(url);
    const callbackError =
      callback.searchParams.get("error_description") ?? callback.searchParams.get("error");
    if (callbackError) throw backendError(new Error(callbackError), "Email sign-in could not be completed.");

    const code = callback.searchParams.get("code");
    if (!code) throw backendError(new Error("Missing PKCE code."), "The email sign-in link is invalid.");

    const { data, error } = await this.client.auth.exchangeCodeForSession(code);
    if (error || !data.session) {
      throw backendError(error, "The email sign-in link is invalid or expired.");
    }
    return data.session;
  }

  async signInWithIdToken(input: {
    provider: AuthProvider;
    token: string;
    accessToken?: string;
    nonce?: string;
  }): Promise<Session> {
    const { data, error } = await this.client.auth.signInWithIdToken({
      provider: input.provider,
      token: input.token,
      access_token: input.accessToken,
      nonce: input.nonce
    });
    if (error || !data.session) throw backendError(error, "Apple sign-in could not be completed.");
    return data.session;
  }

  async setPassword(password: string): Promise<void> {
    this.validatePassword(password);
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw backendError(error, "Your password could not be saved.");
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut({ scope: "global" });
    if (error) throw backendError(error, "Could not sign out.");
  }

  onChange(listener: (event: AuthChangeEvent, session: Session | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange(listener);
    return () => data.subscription.unsubscribe();
  }
}
