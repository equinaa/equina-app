import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushDeviceRecord } from "./contracts";
import { EdgeClient } from "./edge-client";

export class NotificationRepository {
  private readonly edge: EdgeClient;

  constructor(client: SupabaseClient) {
    this.edge = new EdgeClient(client);
  }

  async register(input: {
    token: string;
    platform: "ios" | "android";
    appVersion: string;
  }): Promise<PushDeviceRecord> {
    const response = await this.edge.invoke<{
      device: { id: string; platform: "ios" | "android"; app_version: string; last_seen_at: string };
    }>("register-push-device", input);
    return {
      id: response.device.id,
      platform: response.device.platform,
      appVersion: response.device.app_version,
      lastSeenAt: response.device.last_seen_at
    };
  }

  async revoke(deviceId: string): Promise<void> {
    await this.edge.invoke("revoke-push-device", { deviceId });
  }

  async revokeAll(): Promise<void> {
    await this.edge.invoke("revoke-push-device", { all: true });
  }
}
