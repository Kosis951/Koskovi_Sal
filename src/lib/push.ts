import webpush from "web-push";
import { getDb } from "@/lib/db";

// What a device can subscribe to: "hall" = the hall is taken today (other
// than trainings) and cancelled trainings; "cleanup" = hall waits for cleanup.
export const pushTopics = ["hall", "cleanup"] as const;
export type PushTopic = (typeof pushTopics)[number];

export type PushPayload = {
  body: string;
  // Notifications with the same tag replace each other on the device.
  tag?: string;
  title: string;
  url?: string;
};

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { auth: string; p256dh: string };
};

type SubscriptionRow = {
  auth: string;
  endpoint: string;
  failures: number;
  p256dh: string;
  topics: string;
};

// The server only ever sends to the browsers' own push services, so a forged
// "subscription" cannot make it call arbitrary (internal) addresses.
const pushServiceHosts = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
  "push.apple.com",
  "notify.windows.com",
];
const maxSubscriptions = 5000;
const maxFailures = 20;

let isConfigured: boolean | null = null;

// VAPID keys identify this server to the push services
// (`npm run vapid-keys` prints a new pair for .env.local).
export function isPushConfigured() {
  if (isConfigured === null) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    isConfigured = Boolean(publicKey && privateKey);

    if (isConfigured) {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || "mailto:info@tkkoskovi.cz",
        publicKey!,
        privateKey!,
      );
    }
  }

  return isConfigured;
}

export function getVapidPublicKey() {
  return isPushConfigured() ? process.env.VAPID_PUBLIC_KEY! : null;
}

export function parseSubscription(value: unknown): PushSubscriptionInput | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const { endpoint, keys } = value as { endpoint?: unknown; keys?: unknown };
  const { auth, p256dh } = (keys ?? {}) as { auth?: unknown; p256dh?: unknown };

  if (
    !isPushEndpoint(endpoint) ||
    !isBase64Url(auth, 64) ||
    !isBase64Url(p256dh, 200)
  ) {
    return null;
  }

  return { endpoint, keys: { auth, p256dh } };
}

export function isPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.port === "" || url.port === "443") &&
      pushServiceHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    );
  } catch {
    return false;
  }
}

export function parseTopics(value: unknown): PushTopic[] {
  return Array.isArray(value)
    ? pushTopics.filter((topic) => value.includes(topic))
    : [];
}

// Returns false when the subscription limit is reached.
export function saveSubscription(subscription: PushSubscriptionInput, topics: PushTopic[]) {
  const db = getDb();
  const now = new Date().toISOString();
  const exists = db
    .prepare("SELECT 1 FROM push_subscriptions WHERE endpoint = ?")
    .get(subscription.endpoint);

  if (!exists) {
    const { count } = db.prepare("SELECT COUNT(*) AS count FROM push_subscriptions").get() as {
      count: number;
    };

    if (count >= maxSubscriptions) {
      return false;
    }
  }

  db.prepare(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, topics, failures, created_at, updated_at)
     VALUES (@endpoint, @p256dh, @auth, @topics, 0, @now, @now)
     ON CONFLICT(endpoint) DO UPDATE SET
       p256dh = excluded.p256dh, auth = excluded.auth, topics = excluded.topics,
       failures = 0, updated_at = excluded.updated_at`,
  ).run({
    auth: subscription.keys.auth,
    endpoint: subscription.endpoint,
    now,
    p256dh: subscription.keys.p256dh,
    topics: topics.join(","),
  });

  return true;
}

export function deleteSubscription(endpoint: string) {
  getDb().prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}

export function getSubscriptionTopics(endpoint: string): PushTopic[] | null {
  const row = getDb()
    .prepare("SELECT topics FROM push_subscriptions WHERE endpoint = ?")
    .get(endpoint) as { topics: string } | undefined;

  return row ? parseTopics(row.topics.split(",")) : null;
}

export async function sendToTopic(topic: PushTopic, payload: PushPayload) {
  if (!isPushConfigured()) {
    return 0;
  }

  const rows = (
    getDb().prepare("SELECT * FROM push_subscriptions").all() as SubscriptionRow[]
  ).filter((row) => row.topics.split(",").includes(topic));
  const delivered = await sendToRows(rows, payload);

  // Visible in `pm2 logs`, e.g. "[push] hall: Dnes je sál obsazený → 12/12".
  console.info(`[push] ${topic}: ${payload.title} → ${delivered}/${rows.length}`);

  return delivered;
}

export async function sendToEndpoint(endpoint: string, payload: PushPayload) {
  if (!isPushConfigured()) {
    return 0;
  }

  const rows = getDb()
    .prepare("SELECT * FROM push_subscriptions WHERE endpoint = ?")
    .all(endpoint) as SubscriptionRow[];

  return sendToRows(rows, payload);
}

async function sendToRows(rows: SubscriptionRow[], payload: PushPayload) {
  const body = JSON.stringify(payload);
  let delivered = 0;

  // A few at a time, so a big list does not open hundreds of connections.
  for (let index = 0; index < rows.length; index += 20) {
    const results = await Promise.allSettled(
      rows.slice(index, index + 20).map((row) =>
        webpush.sendNotification(
          { endpoint: row.endpoint, keys: { auth: row.auth, p256dh: row.p256dh } },
          body,
          { TTL: 6 * 60 * 60, urgency: "normal" },
        ),
      ),
    );

    results.forEach((result, offset) => {
      const row = rows[index + offset];

      if (result.status === "fulfilled") {
        delivered += 1;
        return;
      }

      handleSendFailure(row, result.reason);
    });
  }

  return delivered;
}

function handleSendFailure(row: SubscriptionRow, reason: unknown) {
  const statusCode = (reason as { statusCode?: number }).statusCode;

  // 404/410: the device unsubscribed or the app was uninstalled.
  if (statusCode === 404 || statusCode === 410 || row.failures + 1 >= maxFailures) {
    deleteSubscription(row.endpoint);
    return;
  }

  getDb()
    .prepare("UPDATE push_subscriptions SET failures = failures + 1 WHERE endpoint = ?")
    .run(row.endpoint);
  console.error("[push] odeslání selhalo:", statusCode ?? reason);
}

export function readPushState(key: string) {
  const row = getDb().prepare("SELECT value FROM push_state WHERE key = ?").get(key) as
    | { value: string }
    | undefined;

  return row?.value ?? null;
}

export function writePushState(key: string, value: string) {
  getDb()
    .prepare(
      `INSERT INTO push_state (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, new Date().toISOString());
}

// State records older than a week are no longer needed.
export function prunePushState() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  getDb().prepare("DELETE FROM push_state WHERE updated_at < ? AND key <> 'today'").run(cutoff);
}

function isBase64Url(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    /^[A-Za-z0-9_-]+={0,2}$/.test(value)
  );
}
