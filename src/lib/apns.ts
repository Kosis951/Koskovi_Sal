import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import http2 from "node:http2";
import type { PushPayload } from "@/lib/push";

// Notifications for the native iPhone app go through Apple (APNs), signed
// with a key from the Apple Developer account (Keys → Apple Push
// Notifications service). In .env.local:
//   APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID (the app's bundle ID),
//   APNS_KEY_PATH (the downloaded .p8 file) or APNS_KEY (its content),
//   APNS_SANDBOX=true only for apps installed straight from Xcode.

type ApnsConfig = { bundleId: string; host: string; key: KeyObject; keyId: string; teamId: string };

let config: ApnsConfig | null | undefined;
let token: { issuedAt: number; value: string } | null = null;

export function getApnsConfig() {
  if (config !== undefined) {
    return config;
  }

  const { APNS_BUNDLE_ID, APNS_KEY, APNS_KEY_ID, APNS_KEY_PATH, APNS_SANDBOX, APNS_TEAM_ID } =
    process.env;

  config = null;

  if (APNS_KEY_ID && APNS_TEAM_ID && APNS_BUNDLE_ID && (APNS_KEY || APNS_KEY_PATH)) {
    try {
      const pem = APNS_KEY ? APNS_KEY.replace(/\\n/g, "\n") : readFileSync(APNS_KEY_PATH!, "utf8");

      config = {
        bundleId: APNS_BUNDLE_ID,
        host: APNS_SANDBOX === "true" ? "api.sandbox.push.apple.com" : "api.push.apple.com",
        key: createPrivateKey(pem),
        keyId: APNS_KEY_ID,
        teamId: APNS_TEAM_ID,
      };
    } catch (error) {
      console.error("[push] klíč APNs nejde načíst:", error);
    }
  }

  return config;
}

// Apple wants the same token reused for up to an hour.
function getToken(apns: ApnsConfig) {
  const now = Math.floor(Date.now() / 1000);

  if (token && now - token.issuedAt < 50 * 60) {
    return token.value;
  }

  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "ES256", kid: apns.keyId })}.${encode({ iat: now, iss: apns.teamId })}`;
  const signature = sign("sha256", Buffer.from(unsigned), { dsaEncoding: "ieee-p1363", key: apns.key });

  token = { issuedAt: now, value: `${unsigned}.${signature.toString("base64url")}` };

  return token.value;
}

export function isApnsToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64,200}$/i.test(value);
}

// Sends one notification to each device token. Returns per token whether it
// arrived, failed for now, or is gone (the app was removed: forget it).
export async function sendApns(tokens: string[], payload: PushPayload) {
  const apns = getApnsConfig();
  const results = new Map<string, "delivered" | "failed" | "gone">();

  if (!apns || tokens.length === 0) {
    return results;
  }

  const body = JSON.stringify({
    aps: {
      alert: { body: payload.body, title: payload.title },
      sound: "default",
      ...(payload.tag ? { "thread-id": payload.tag } : {}),
    },
    url: payload.url,
  });
  const session = http2.connect(`https://${apns.host}`);

  session.on("error", (error) => console.error("[push] spojení s APNs selhalo:", error));

  try {
    await Promise.all(
      tokens.map(
        (deviceToken) =>
          new Promise<void>((resolve) => {
            const request = session.request({
              ":method": "POST",
              ":path": `/3/device/${deviceToken}`,
              authorization: `bearer ${getToken(apns)}`,
              "apns-expiration": String(Math.floor(Date.now() / 1000) + 6 * 60 * 60),
              "apns-priority": "10",
              "apns-push-type": "alert",
              "apns-topic": apns.bundleId,
              ...(payload.tag ? { "apns-collapse-id": payload.tag.slice(0, 64) } : {}),
              "content-type": "application/json",
            });
            let status = 0;
            let response = "";

            request.setEncoding("utf8");
            request.on("response", (headers) => {
              status = Number(headers[":status"]);
            });
            request.on("data", (chunk: string) => {
              response += chunk;
            });
            // "close" follows "end", an error and a timeout alike.
            request.on("close", () => {
              let reason = "";

              try {
                reason = response ? ((JSON.parse(response) as { reason?: string }).reason ?? "") : "";
              } catch {
                // Not JSON: keep the status only.
              }

              if (status === 200) {
                results.set(deviceToken, "delivered");
              } else if (status === 410 || reason === "BadDeviceToken" || reason === "Unregistered") {
                results.set(deviceToken, "gone");
              } else {
                results.set(deviceToken, "failed");
                console.error("[push] APNs odmítl:", status || "bez odpovědi", reason);
              }

              resolve();
            });
            request.on("error", () => undefined);
            request.setTimeout(15000, () => request.close());
            request.end(body);
          }),
      ),
    );
  } finally {
    session.close();
  }

  return results;
}
