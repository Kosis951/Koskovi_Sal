// Service worker of the installed app.
// - Build assets, fonts and icons: served from the cache (their names change
//   with every build, so they never go stale).
// - Pages and /api: always from the network, never cached, so the calendar is
//   current and no private data stays on the device after logging out.
// - Offline: pages fall back to /offline.html.
const version = "v1";
const staticCache = `koskovi-static-${version}`;
const offlineUrl = "/offline.html";
const maxStaticEntries = 120;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(staticCache)
      .then((cache) => cache.addAll([offlineUrl, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("koskovi-") && key !== staticCache)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/")
  );
}

// Old build files pile up after deploys; keep the newest entries only.
async function trimCache(cache) {
  const keys = await cache.keys();

  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - maxStaticEntries)).map((key) => cache.delete(key)),
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(staticCache);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  if (response.ok) {
    await cache.put(request, response.clone());
    void trimCache(cache);
  }

  return response;
}

async function networkWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(staticCache);

    return (await cache.match(offlineUrl)) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(networkWithOfflineFallback(request));
  }
  // Everything else (API, manifest, …) goes straight to the network.
});
