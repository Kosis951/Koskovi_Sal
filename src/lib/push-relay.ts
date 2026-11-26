import type { PushPayload } from "@/lib/push";

// Notifications for the native apps go through the push relay on the NAS
// (nas/push-relay): it holds the Apple key for iPhones and the Google
// (Firebase) service account for Android phones. In .env.local:
//   PUSH_RELAY_URL=https://app.tkkoskovi.cz
//   PUSH_RELAY_SECRET=… (the relay's RELAY_SECRET)

export type NativePlatform = "android" | "ios";
// "ios-live": an iPhone's token for starting a Live Activity (lesson countdown).
export type RelayPlatform = NativePlatform | "ios-live";
export type RelayResult = "delivered" | "failed" | "gone";

export function getRelayUrl() {
  const url = process.env.PUSH_RELAY_URL?.trim();
  const secret = process.env.PUSH_RELAY_SECRET?.trim();

  if (!url || !secret) {
    return null;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.hostname === "localhost" ? parsed : null;
  } catch {
    return null;
  }
}

export function isApnsToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64,200}$/i.test(value);
}

// An Android phone's Firebase (FCM) registration token.
// An iPhone's push-to-start token for Live Activities (hex like APNs tokens).
export function isLiveToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64,400}$/i.test(value);
}

export function isFcmToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_:-]{100,400}$/.test(value);
}

export async function sendThroughRelay(
  devices: Array<{ platform: RelayPlatform; token: string }>,
  payload: PushPayload,
) {
  const relay = getRelayUrl();
  const results = new Map<string, RelayResult>();

  if (!relay || devices.length === 0) {
    return results;
  }

  // The relay takes up to 2000 devices at a time.
  for (let index = 0; index < devices.length; index += 1000) {
    const batch = devices.slice(index, index + 1000);

    try {
      const response = await fetch(new URL("/relay/send", relay), {
        body: JSON.stringify({ devices: batch, payload }),
        headers: {
          Authorization: `Bearer ${process.env.PUSH_RELAY_SECRET!.trim()}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        throw new Error(`relay ${response.status}`);
      }

      const data = (await response.json()) as { results?: Record<string, RelayResult> };

      for (const device of batch) {
        results.set(device.token, data.results?.[device.token] ?? "failed");
      }
    } catch (error) {
      console.error("[push] relay na NAS nedostupný:", error instanceof Error ? error.message : error);

      for (const device of batch) {
        results.set(device.token, "failed");
      }
    }
  }

  return results;
}
