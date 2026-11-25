// Push relay for the Koškovi sál apps, running on the NAS (no dependencies).
//
//   POST /relay/send     – from the web (VPS), with `Authorization: Bearer
//                          RELAY_SECRET`: { payload, devices } → per device
//                          "delivered" | "failed" | "gone". iPhones go to Apple
//                          (APNs, the key stays here), Android phones to ntfy.
//   GET  /relay/health   – what is set up.
//   GET  /app/<name>.apk – the Android app to download (./downloads).
//   anything else        – passed on to ntfy (the Android phones' ntfy app
//                          connects here), WebSockets included.
import { createPrivateKey, sign, timingSafeEqual } from "node:crypto";
import { createReadStream, readFileSync, statSync } from "node:fs";
import http from "node:http";
import http2 from "node:http2";
import net from "node:net";
import path from "node:path";

const env = process.env;
const port = Number(env.PORT || 8080);
// The secret shared with the web: from RELAY_SECRET or a file in ./secrets.
const secret = (env.RELAY_SECRET || readSecretFile(env.RELAY_SECRET_FILE || "/secrets/relay-secret.txt")).trim();
const ntfy = new URL(env.NTFY_INTERNAL_URL || "http://ntfy:80");
const downloads = env.DOWNLOADS_DIR || "/downloads";
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

async function sendApns(tokens, payload, results) {
  if (tokens.length === 0) {
    return;
  }

  if (!apns) {
    tokens.forEach((token) => results.set(token, "failed"));
    return;
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

  session.on("error", (error) => console.error("[relay] spojení s APNs selhalo:", error.message));

  try {
    // A few at a time, so a long list does not open hundreds of streams.
    for (let index = 0; index < tokens.length; index += 50) {
      await Promise.all(tokens.slice(index, index + 50).map((token) => sendOneApns(session, token, body, payload, results)));
    }
  } finally {
    session.close();
  }
}

function sendOneApns(session, token, body, payload, results) {
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
        "apns-push-type": "alert",
        "apns-topic": apns.bundleId,
        ...(payload.tag ? { "apns-collapse-id": String(payload.tag).slice(0, 64) } : {}),
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

      if (status === 200) {
        results.set(token, "delivered");
      } else if (status === 410 || reason === "BadDeviceToken" || reason === "Unregistered") {
        results.set(token, "gone");
      } else {
        results.set(token, "failed");
        console.error("[relay] APNs odmítl:", status || "bez odpovědi", reason);
      }

      resolve();
    });
    request.setTimeout(15000, () => request.close());
    request.end(body);
  });
}

// --- Android (UnifiedPush through ntfy) ---

// The phone registers "https://push…/upXXXX?up=1"; only the topic matters,
// the message goes straight to the ntfy next door.
function ntfyTopic(endpoint) {
  try {
    const topic = new URL(endpoint).pathname.slice(1);
    return /^up[A-Za-z0-9_-]{8,64}$/.test(topic) ? topic : null;
  } catch {
    return null;
  }
}

async function sendNtfy(endpoints, payload, results) {
  const body = JSON.stringify(payload);

  for (let index = 0; index < endpoints.length; index += 20) {
    await Promise.all(
      endpoints.slice(index, index + 20).map(async (endpoint) => {
        const topic = ntfyTopic(endpoint);

        if (!topic) {
          results.set(endpoint, "gone");
          return;
        }

        try {
          const response = await fetch(new URL(`/${topic}?up=1`, ntfy), {
            body,
            method: "POST",
            signal: AbortSignal.timeout(15000),
          });
          results.set(endpoint, response.ok ? "delivered" : "failed");

          if (!response.ok) {
            console.error("[relay] ntfy odmítl:", response.status);
          }
        } catch (error) {
          results.set(endpoint, "failed");
          console.error("[relay] ntfy nedostupný:", error.message);
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
  };
  const ios = devices
    .filter((device) => device?.platform === "ios" && /^[0-9a-f]{64,200}$/i.test(device.token ?? ""))
    .map((device) => device.token);
  const android = devices
    .filter((device) => device?.platform === "android" && typeof device.token === "string")
    .map((device) => device.token);
  const results = new Map();

  await Promise.all([sendApns(ios, clean, results), sendNtfy(android, clean, results)]);

  const delivered = [...results.values()].filter((result) => result === "delivered").length;
  console.info(`[relay] ${clean.title} → ${delivered}/${results.size}`);
  json(response, 200, { results: Object.fromEntries(results) });
}

async function handleHealth(response) {
  let ntfyHealthy = false;

  try {
    const health = await fetch(new URL("/v1/health", ntfy), { signal: AbortSignal.timeout(5000) });
    ntfyHealthy = health.ok && (await health.json()).healthy === true;
  } catch {
    // Not reachable.
  }

  json(response, 200, { apns: Boolean(apns), ntfy: ntfyHealthy, ok: true });
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
    json(response, 404, { message: "Soubor nenalezen." });
  }
}

// The client's address for ntfy's rate limits: DSM's reverse proxy appends it
// as the last X-Forwarded-For entry.
function clientAddress(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded.at(-1) || request.socket.remoteAddress || "";
}

function proxyHeaders(request) {
  const headers = { ...request.headers, host: request.headers.host || ntfy.host };
  headers["x-forwarded-for"] = clientAddress(request);
  return headers;
}

function proxyToNtfy(request, response) {
  const upstream = http.request(
    {
      headers: proxyHeaders(request),
      host: ntfy.hostname,
      method: request.method,
      path: request.url,
      port: ntfy.port || 80,
    },
    (reply) => {
      response.writeHead(reply.statusCode || 502, reply.headers);
      reply.pipe(response);
    },
  );

  upstream.on("error", () => {
    if (!response.headersSent) {
      json(response, 502, { message: "ntfy neodpovídá." });
    } else {
      response.destroy();
    }
  });
  request.pipe(upstream);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", "http://relay");
  const apk = /^\/app\/([A-Za-z0-9._-]+\.apk)$/.exec(url.pathname);

  if (url.pathname === "/relay/send" && request.method === "POST") {
    handleSend(request, response).catch(() => json(response, 500, { message: "Chyba relaye." }));
  } else if (url.pathname === "/relay/health") {
    handleHealth(response);
  } else if (apk && (request.method === "GET" || request.method === "HEAD")) {
    handleDownload(request, response, apk[1]);
  } else if (url.pathname.startsWith("/relay/") || url.pathname.startsWith("/app/")) {
    json(response, 404, { message: "Nenalezeno." });
  } else {
    proxyToNtfy(request, response);
  }
});

// WebSocket subscriptions of the ntfy app.
server.on("upgrade", (request, socket, head) => {
  const upstream = net.connect(Number(ntfy.port || 80), ntfy.hostname, () => {
    const headers = proxyHeaders(request);
    const lines = [`${request.method} ${request.url} HTTP/1.1`];

    for (const [name, value] of Object.entries(headers)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        lines.push(`${name}: ${item}`);
      }
    }

    upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head?.length) {
      upstream.write(head);
    }
    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

// Long ntfy subscriptions must not be cut off.
server.requestTimeout = 0;
server.headersTimeout = 30000;
server.keepAliveTimeout = 65000;

server.listen(port, () => {
  console.info(`[relay] běží na portu ${port}; APNs ${apns ? "zapnuté" : "vypnuté"}, ntfy ${ntfy.origin}`);
});
