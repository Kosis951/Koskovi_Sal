// Push relay for the Koškovi sál apps, running on the NAS (no dependencies).
//
//   POST /relay/send     – from the web (VPS), with `Authorization: Bearer
//                          RELAY_SECRET`: { payload, devices } → per device
//                          "delivered" | "failed" | "gone". iPhones go to Apple
//                          (APNs, the key stays here), Android phones to
//                          Google (FCM, the service account stays here).
//   GET  /relay/health   – what is set up.
//   GET  /app/<name>.apk – the Android app to download (./downloads, else
//                          the GitHub release "android-latest").
//   GET  /, /privacy, /support – the apps' web pages (./site), also for
//                          app.tkkoskovi.cz.
import { createPrivateKey, sign, timingSafeEqual } from "node:crypto";
import { createReadStream, readFileSync, statSync } from "node:fs";
import http from "node:http";
import http2 from "node:http2";
import path from "node:path";
import { Readable } from "node:stream";

const env = process.env;
const port = Number(env.PORT || 8080);
// The secret shared with the web: from RELAY_SECRET or a file in ./secrets.
const secret = (env.RELAY_SECRET || readSecretFile(env.RELAY_SECRET_FILE || "/secrets/relay-secret.txt")).trim();
const downloads = env.DOWNLOADS_DIR || "/downloads";
// Where the APK comes from when ./downloads does not have it (built by the
// repository's Android workflow).
const releaseDownloads = (env.APK_RELEASE_URL || "https://github.com/Kosis951/Koskovi_Sal/releases/download/android-latest").replace(/\/$/, "");
const site = env.SITE_DIR || "/site";
// The pages and what they are served as (built by scripts/build-app-site.mts
// in the web's look).
const sitePages = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/brand/zaklad-white.svg": ["brand/zaklad-white.svg", "image/svg+xml"],
  "/brand/znak-white.svg": ["brand/znak-white.svg", "image/svg+xml"],
  "/icon.png": ["icon.png", "image/png"],
  "/logo.svg": ["logo.svg", "image/svg+xml"],
  "/privacy": ["privacy.html", "text/html; charset=utf-8"],
  "/support": ["support.html", "text/html; charset=utf-8"],
  "/web.css": ["web.css", "text/css; charset=utf-8"],
  ...Object.fromEntries(
    ["regular", "medium", "semibold", "bold", "black"].map((weight) => [
      `/fonts/br-firma-${weight}.woff2`,
      [`fonts/br-firma-${weight}.woff2`, "font/woff2"],
    ]),
  ),
};
const maxBody = 1024 * 1024;
const maxDevices = 2000;

function readSecretFile(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

if (secret.length < 32) {
  console.error("Tajný řetězec relaye (secrets/relay-secret.txt) musí mít aspoň 32 znaků.");
  process.exit(1);
}

// --- APNs ---

let apns = null;

try {
  if (env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_BUNDLE_ID) {
    apns = {
      bundleId: env.APNS_BUNDLE_ID,
      host: env.APNS_SANDBOX === "true" ? "api.sandbox.push.apple.com" : "api.push.apple.com",
      key: createPrivateKey(readFileSync(env.APNS_KEY_PATH || "/secrets/AuthKey.p8", "utf8")),
      keyId: env.APNS_KEY_ID,
      teamId: env.APNS_TEAM_ID,
    };
  }
} catch (error) {
  console.error("[relay] klíč APNs nejde načíst:", error.message);
}

let apnsToken = null;

// Apple wants the same token reused for up to an hour.
function getApnsToken() {
  const now = Math.floor(Date.now() / 1000);

  if (apnsToken && now - apnsToken.issuedAt < 50 * 60) {
    return apnsToken.value;
  }

  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "ES256", kid: apns.keyId })}.${encode({ iat: now, iss: apns.teamId })}`;
  const signature = sign("sha256", Buffer.from(unsigned), { dsaEncoding: "ieee-p1363", key: apns.key });

  apnsToken = { issuedAt: now, value: `${unsigned}.${signature.toString("base64url")}` };
  return apnsToken.value;
}

// `live`: the tokens start a Live Activity (the lesson countdown on the lock
// screen and in the Dynamic Island, iOS 17.2+) instead of a notification.
async function sendApns(tokens, payload, results, live = false) {
  if (tokens.length === 0) {
    return;
  }

  if (!apns || (live && !payload.lesson)) {
    tokens.forEach((token) => results.set(token, "failed"));
    return;
  }

  const alert = { body: payload.body, title: payload.title };
  const body = JSON.stringify(
    live
      ? {
          aps: {
            alert,
            attributes: {
              endsAt: payload.lesson.endsAt,
              startsAt: payload.lesson.startsAt,
              time: payload.lesson.time,
              title: payload.lesson.title,
            },
            "attributes-type": "LessonActivityAttributes",
            "content-state": { phase: "upcoming" },
            "dismissal-date": payload.lesson.endsAt,
            event: "start",
            sound: "default",
            "stale-date": payload.lesson.endsAt,
            timestamp: Math.floor(Date.now() / 1000),
          },
        }
      : {
          aps: {
            alert,
            sound: "default",
            ...(payload.tag ? { "thread-id": payload.tag } : {}),
          },
          url: payload.url,
        },
  );
  payload = { ...payload, live };
  // An app installed from Xcode has a token of Apple's test servers (sandbox),
  // one from TestFlight or the App Store of the real ones. Each server calls
  // the other's tokens "BadDeviceToken", so those are tried on the other one.
  const otherHost = apns.host === "api.push.apple.com" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const retry = [];

  await sendApnsVia(apns.host, tokens, body, payload, results, retry);

  if (retry.length > 0) {
    await sendApnsVia(otherHost, retry, body, payload, results, null);
  }
}

async function sendApnsVia(host, tokens, body, payload, results, retry) {
  const session = http2.connect(`https://${host}`);

  session.on("error", (error) => console.error(`[relay] spojení s APNs (${host}) selhalo:`, error.message));

  try {
    // A few at a time, so a long list does not open hundreds of streams.
    for (let index = 0; index < tokens.length; index += 50) {
      await Promise.all(
        tokens.slice(index, index + 50).map((token) => sendOneApns(session, host, token, body, payload, results, retry)),
      );
    }
  } finally {
    session.close();
  }
}

function sendOneApns(session, host, token, body, payload, results, retry) {
  return new Promise((resolve) => {
    let status = 0;
    let response = "";
    let request;

    try {
      request = session.request({
        ":method": "POST",
        ":path": `/3/device/${token}`,
        authorization: `bearer ${getApnsToken()}`,
        "apns-expiration": String(Math.floor(Date.now() / 1000) + 6 * 60 * 60),
        "apns-priority": "10",
        "apns-push-type": payload.live ? "liveactivity" : "alert",
        "apns-topic": payload.live ? `${apns.bundleId}.push-type.liveactivity` : apns.bundleId,
        ...(payload.tag && !payload.live ? { "apns-collapse-id": String(payload.tag).slice(0, 64) } : {}),
        "content-type": "application/json",
      });
    } catch {
      results.set(token, "failed");
      resolve();
      return;
    }

    request.setEncoding("utf8");
    request.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    request.on("data", (chunk) => {
      response += chunk;
    });
    request.on("error", () => undefined);
    // "close" follows "end", an error and a timeout alike.
    request.on("close", () => {
      let reason = "";

      try {
        reason = response ? JSON.parse(response).reason ?? "" : "";
      } catch {
        // Not JSON: keep the status only.
      }

      const device = `…${token.slice(-6)} (${host})`;

      if (status === 200) {
        results.set(token, "delivered");
      } else if (reason === "BadDeviceToken" && retry) {
        retry.push(token);
      } else if (status === 410 || reason === "BadDeviceToken" || reason === "Unregistered") {
        results.set(token, "gone");
        console.warn("[relay] APNs: zařízení neplatí:", device, status, reason);
      } else {
        results.set(token, "failed");
        console.error("[relay] APNs odmítl:", device, status || "bez odpovědi", reason);
      }

      resolve();
    });
    request.setTimeout(15000, () => request.close());
    request.end(body);
  });
}

// --- Android (Firebase Cloud Messaging) ---

// The Firebase project's service account (Project settings → Service
// accounts → Generate new private key), saved as secrets/fcm.json.
let fcm = null;

try {
  const account = JSON.parse(readFileSync(env.FCM_ACCOUNT_PATH || "/secrets/fcm.json", "utf8"));

  if (account.client_email && account.private_key && account.project_id) {
    fcm = {
      email: account.client_email,
      key: createPrivateKey(account.private_key),
      projectId: account.project_id,
      tokenUri: account.token_uri || "https://oauth2.googleapis.com/token",
    };
  }
} catch (error) {
  if (error.code !== "ENOENT") {
    console.error("[relay] účet FCM (secrets/fcm.json) nejde načíst:", error.message);
  }
}

let fcmAccess = null;

// Google's access token for sending, valid for an hour.
async function getFcmAccess() {
  const now = Math.floor(Date.now() / 1000);

  if (fcmAccess && now < fcmAccess.expiresAt - 300) {
    return fcmAccess.value;
  }

  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    aud: fcm.tokenUri,
    exp: now + 3600,
    iat: now,
    iss: fcm.email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })}`;
  const assertion = `${unsigned}.${sign("sha256", Buffer.from(unsigned), fcm.key).toString("base64url")}`;
  const response = await fetch(fcm.tokenUri, {
    body: new URLSearchParams({ assertion, grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer" }),
    method: "POST",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`přihlášení ke Googlu ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  fcmAccess = { expiresAt: now + Number(data.expires_in || 3600), value: data.access_token };
  return fcmAccess.value;
}

async function sendFcm(tokens, payload, results) {
  if (tokens.length === 0) {
    return;
  }

  let access;

  try {
    if (!fcm) {
      throw new Error("chybí secrets/fcm.json");
    }
    access = await getFcmAccess();
  } catch (error) {
    console.error("[relay] FCM:", error.message);
    tokens.forEach((token) => results.set(token, "failed"));
    return;
  }

  const url = `${env.FCM_API_URL || "https://fcm.googleapis.com"}/v1/projects/${fcm.projectId}/messages:send`;

  for (let index = 0; index < tokens.length; index += 20) {
    await Promise.all(
      tokens.slice(index, index + 20).map(async (token) => {
        try {
          const response = await fetch(url, {
            body: JSON.stringify({
              message: payload.lesson
                ? {
                    // A lesson reminder: data only, so the app always gets it
                    // and shows its own notification with a countdown.
                    android: { priority: "high", ttl: "3600s" },
                    data: {
                      body: payload.body,
                      endsAt: String(payload.lesson.endsAt),
                      kind: "lesson",
                      startsAt: String(payload.lesson.startsAt),
                      time: payload.lesson.time,
                      title: payload.title,
                    },
                    token,
                  }
                : {
                    // Shown by the system when the app is closed; the app shows it
                    // itself while open (PushService).
                    android: {
                      notification: { channel_id: "hall", ...(payload.tag ? { tag: payload.tag } : {}) },
                      priority: "high",
                      ttl: `${6 * 60 * 60}s`,
                    },
                    data: { body: payload.body, title: payload.title, ...(payload.url ? { url: payload.url } : {}) },
                    notification: { body: payload.body, title: payload.title },
                    token,
                  },
            }),
            headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
            method: "POST",
            signal: AbortSignal.timeout(15000),
          });

          if (response.ok) {
            results.set(token, "delivered");
            return;
          }

          const error = (await response.json().catch(() => null))?.error;
          const code = error?.details?.find((detail) => detail.errorCode)?.errorCode || error?.status || "";
          const device = `…${token.slice(-6)}`;

          // The app was removed or the token replaced (a bad message of ours
          // is also INVALID_ARGUMENT, so only when it is about the token).
          const badToken = response.status === 400 && /registration token/i.test(error?.message ?? "");

          if (response.status === 404 || code === "UNREGISTERED" || badToken) {
            results.set(token, "gone");
            console.warn("[relay] FCM: zařízení neplatí:", device, response.status, code);
          } else {
            results.set(token, "failed");
            console.error("[relay] FCM odmítl:", device, response.status, code, error?.message ?? "");
          }
        } catch (error) {
          results.set(token, "failed");
          console.error("[relay] FCM nedostupný:", error.message);
        }
      }),
    );
  }
}

// --- HTTP ---

function json(response, status, value) {
  response.writeHead(status, { "cache-control": "no-store", "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function isAuthorized(request) {
  const given = Buffer.from(String(request.headers.authorization || ""));
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBody) {
        reject(new Error("too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function handleSend(request, response) {
  if (!isAuthorized(request)) {
    json(response, 401, { message: "Neplatný klíč relaye." });
    return;
  }

  let input;

  try {
    input = JSON.parse(await readBody(request));
  } catch {
    json(response, 400, { message: "Neplatný požadavek." });
    return;
  }

  const payload = input?.payload;
  const devices = Array.isArray(input?.devices) ? input.devices.slice(0, maxDevices) : [];

  if (!payload || typeof payload.title !== "string" || typeof payload.body !== "string") {
    json(response, 400, { message: "Chybí text upozornění." });
    return;
  }

  const clean = {
    body: payload.body.slice(0, 1000),
    tag: typeof payload.tag === "string" ? payload.tag.slice(0, 64) : undefined,
    title: payload.title.slice(0, 200),
    url: typeof payload.url === "string" ? payload.url.slice(0, 500) : undefined,
    lesson: cleanLesson(payload.lesson),
  };
  const ios = devices
    .filter((device) => device?.platform === "ios" && /^[0-9a-f]{64,200}$/i.test(device.token ?? ""))
    .map((device) => device.token);
  // Android phones: their Firebase token.
  const fcmTokens = devices
    .filter((device) => device?.platform === "android" && /^[A-Za-z0-9_:-]{20,400}$/.test(device.token ?? ""))
    .map((device) => device.token);
  const live = devices
    .filter((device) => device?.platform === "ios-live" && /^[0-9a-f]{64,400}$/i.test(device.token ?? ""))
    .map((device) => device.token);
  const results = new Map();

  await Promise.all([
    sendApns(ios, clean, results),
    sendApns(live, clean, results, true),
    sendFcm(fcmTokens, clean, results),
  ]);

  const delivered = [...results.values()].filter((result) => result === "delivered").length;
  console.info(`[relay] ${clean.title} → ${delivered}/${results.size}`);
  json(response, 200, { results: Object.fromEntries(results) });
}

// { startsAt, endsAt (Unix seconds), time, title } of a lesson reminder.
function cleanLesson(lesson) {
  if (!lesson || !Number.isFinite(lesson.startsAt) || !Number.isFinite(lesson.endsAt)) {
    return undefined;
  }

  return {
    endsAt: Math.floor(lesson.endsAt),
    startsAt: Math.floor(lesson.startsAt),
    time: String(lesson.time ?? "").slice(0, 40),
    title: String(lesson.title ?? "").slice(0, 80),
  };
}

function handleHealth(response) {
  json(response, 200, { apns: Boolean(apns), fcm: Boolean(fcm), ok: true });
}

// Browsers that once opened the former ntfy web app here keep showing it from
// its service worker. This one replaces it: it unregisters itself and reloads the
// open pages, which then get the real pages from the server.
const serviceWorkerRemover = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
  })());
});
`;

function handleSitePage(request, response, [name, type]) {
  try {
    const body = readFileSync(path.join(site, name));
    response.writeHead(200, {
      "cache-control": "public, max-age=300",
      "content-length": body.length,
      "content-type": type,
      "x-content-type-options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    json(response, 404, { message: "Nenalezeno." });
  }
}

function handleDownload(request, response, name) {
  const file = path.join(downloads, name);

  try {
    const stats = statSync(file);
    response.writeHead(200, {
      "cache-control": "no-cache",
      "content-disposition": `attachment; filename="${name}"`,
      "content-length": stats.size,
      "content-type": "application/vnd.android.package-archive",
      "last-modified": stats.mtime.toUTCString(),
    });

    if (request.method === "HEAD") {
      response.end();
    } else {
      createReadStream(file).pipe(response);
    }
  } catch {
    downloadFromRelease(request, response, name);
  }
}

async function downloadFromRelease(request, response, name) {
  try {
    const upstream = await fetch(`${releaseDownloads}/${name}`, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(120_000),
    });

    if (!upstream.ok) {
      json(response, 404, { message: "Soubor nenalezen." });
      return;
    }

    const headers = {
      "cache-control": "no-cache",
      "content-disposition": `attachment; filename="${name}"`,
      "content-type": "application/vnd.android.package-archive",
    };
    const length = upstream.headers.get("content-length");
    const modified = upstream.headers.get("last-modified");
    if (length) headers["content-length"] = length;
    if (modified) headers["last-modified"] = modified;
    response.writeHead(200, headers);

    if (request.method === "HEAD" || !upstream.body) {
      response.end();
    } else {
      Readable.fromWeb(upstream.body).on("error", () => response.destroy()).pipe(response);
    }
  } catch {
    if (response.headersSent) {
      response.destroy();
    } else {
      json(response, 502, { message: "Aplikaci se teď nepodařilo stáhnout, zkus to za chvíli." });
    }
  }
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", "http://relay");
  const apk = /^\/app\/([A-Za-z0-9._-]+\.apk)$/.exec(url.pathname);

  if (url.pathname === "/relay/send" && request.method === "POST") {
    handleSend(request, response).catch(() => json(response, 500, { message: "Chyba relaye." }));
  } else if (url.pathname === "/relay/health") {
    handleHealth(response);
  } else if (url.pathname === "/sw.js") {
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/javascript; charset=utf-8",
    });
    response.end(serviceWorkerRemover);
  } else if (Object.hasOwn(sitePages, url.pathname) && (request.method === "GET" || request.method === "HEAD")) {
    handleSitePage(request, response, sitePages[url.pathname]);
  } else if (apk && (request.method === "GET" || request.method === "HEAD")) {
    handleDownload(request, response, apk[1]);
  } else {
    json(response, 404, { message: "Nenalezeno." });
  }
});

server.listen(port, () => {
  console.info(`[relay] běží na portu ${port}; APNs ${apns ? "zapnuté" : "vypnuté"}, FCM ${fcm ? "zapnuté" : "vypnuté"}`);
});
