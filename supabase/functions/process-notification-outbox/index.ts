import { requireAutomationSecret } from "../_shared/automation.ts";
import { handleOptions, json, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";

type OutboxRow = {
  id: number;
  recipient_id: string;
  event_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  attempts: number;
  lease_token: string;
};

const quietHoursActive = (
  timezone: string,
  start: string | null,
  end: string | null,
) => {
  if (!start || !end) return false;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    const current = hour * 60 + minute;
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);
    const from = (startHour ?? 0) * 60 + (startMinute ?? 0);
    const to = (endHour ?? 0) * 60 + (endMinute ?? 0);
    return from <= to ? current >= from && current < to : current >= from || current < to;
  } catch {
    return false;
  }
};

const retryAt = (attempts: number) =>
  new Date(Date.now() + Math.min(360, 2 ** Math.max(0, attempts - 1)) * 60_000).toISOString();

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "POST");
    await requireAutomationSecret(
      request,
      "NOTIFICATION_AUTOMATION_SECRET",
      "x-automation-secret",
    );
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("claim_notification_outbox", { batch_size: 25 });
    if (error) throw error;
    const rows = (data ?? []) as OutboxRow[];
    const delivered: number[] = [];
    const suppressed: number[] = [];
    const retried: number[] = [];

    for (const item of rows) {
      const [{ data: preferences, error: preferencesError }, { data: devices, error: devicesError }] = await Promise.all([
        admin.from("notification_preferences").select("*").eq("user_id", item.recipient_id).maybeSingle(),
        admin.from("push_devices").select("id,expo_push_token").eq("user_id", item.recipient_id).is("revoked_at", null),
      ]);
      if (preferencesError || devicesError) throw preferencesError ?? devicesError;
      const enabled = item.event_type === "marketplace_message"
        ? Boolean(preferences?.human_messages)
        : item.event_type === "order_change"
        ? Boolean(preferences?.order_changes)
        : item.event_type === "horse_reminder"
        ? Boolean(preferences?.horse_reminders)
        : item.event_type === "academy_reminder"
        ? Boolean(preferences?.academy_reminders)
        : false;

      if (!enabled || !devices?.length) {
        await admin.from("notification_outbox").update({
          status: "suppressed",
          last_error_code: enabled ? "no_active_device" : "preference_disabled",
          lease_token: null,
          lease_expires_at: null,
        }).eq("id", item.id).eq("lease_token", item.lease_token);
        suppressed.push(item.id);
        continue;
      }

      if (quietHoursActive(
        String(preferences?.quiet_hours_timezone ?? "UTC"),
        preferences?.quiet_hours_start ?? null,
        preferences?.quiet_hours_end ?? null,
      )) {
        await admin.from("notification_outbox").update({
          status: "retry",
          next_attempt_at: new Date(Date.now() + 30 * 60_000).toISOString(),
          last_error_code: "quiet_hours",
          lease_token: null,
          lease_expires_at: null,
        }).eq("id", item.id).eq("lease_token", item.lease_token);
        retried.push(item.id);
        continue;
      }

      const listingTitle = typeof item.payload.listingTitle === "string"
        ? item.payload.listingTitle.slice(0, 80)
        : "Shop item";
      const messages = devices.map((device) => ({
        to: device.expo_push_token,
        title: "New Equina message",
        body: `New message about ${listingTitle}`,
        sound: "default",
        data: {
          route: "shop-conversation",
          conversationId: item.entity_id,
        },
      }));

      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json",
            ...(Deno.env.get("EXPO_ACCESS_TOKEN")
              ? { "Authorization": `Bearer ${Deno.env.get("EXPO_ACCESS_TOKEN")}` }
              : {}),
          },
          body: JSON.stringify(messages),
        });
        if (!response.ok) throw new Error("push_provider_unavailable");
        const result = await response.json() as { data?: Array<{ status?: string; details?: { error?: string } }> };
        const tickets = result.data ?? [];
        for (const [index, ticket] of tickets.entries()) {
          if (ticket.details?.error === "DeviceNotRegistered") {
            const device = devices[index];
            if (device) {
              await admin.from("push_devices").update({
                revoked_at: new Date().toISOString(),
                disabled_reason: "device_not_registered",
              }).eq("id", device.id);
            }
          }
        }
        if (!tickets.some((ticket) => ticket.status === "ok")) throw new Error("push_delivery_rejected");
        await admin.from("notification_outbox").update({
          status: "delivered",
          delivered_at: new Date().toISOString(),
          last_error_code: null,
          lease_token: null,
          lease_expires_at: null,
        }).eq("id", item.id).eq("lease_token", item.lease_token);
        delivered.push(item.id);
      } catch {
        const dead = item.attempts >= 6;
        await admin.from("notification_outbox").update({
          status: dead ? "dead_letter" : "retry",
          next_attempt_at: retryAt(item.attempts),
          last_error_code: "push_provider_failed",
          lease_token: null,
          lease_expires_at: null,
        }).eq("id", item.id).eq("lease_token", item.lease_token);
        retried.push(item.id);
      }
    }

    return json({ claimed: rows.length, delivered, suppressed, retried });
  } catch (error) {
    return respondToError(error);
  }
});
