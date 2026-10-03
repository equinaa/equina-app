import type { SupabaseClient } from "@supabase/supabase-js";
import * as Crypto from "expo-crypto";
import { edgeFailure, requireData } from "./errors";

export class EdgeClient {
  constructor(private readonly client: SupabaseClient) {}

  async invoke<TResponse>(name: string, body?: object, method: "GET" | "POST" = "POST"): Promise<TResponse> {
    const { data, error } = await this.client.functions.invoke(name, {
      body: body as Record<string, unknown> | undefined,
      method,
      headers: { "x-request-id": Crypto.randomUUID() }
    });
    if (error) throw await edgeFailure(error, `${name} could not be completed.`);
    return requireData(data as TResponse | null, null, `${name} returned no data.`);
  }
}
