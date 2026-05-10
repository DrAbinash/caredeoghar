/**
 * ERP Service Worker
 *
 * Caching strategies:
 *   Static assets (hashed Vite output) → Cache-first
 *   API GET requests                   → Stale-while-revalidate (instant from cache,
 *                                         background refresh keeps data current)
 *   Mutations + auth + version check   → Network-only (never cached)
 *
 * This makes the ERP feel significantly faster after the first visit:
 * data loads instantly from the local cache while a fresh copy is fetched
 * silently in the background.  It also keeps the app usable when the
 * network drops briefly.
 */

const STATIC_CACHE = "erp-static-v1";
const API_CACHE    = "erp-api-v1";

// Maximum age for cached API responses (24 h).
// Stale responses older than this are re-fetched synchronously.
const MAX_API_AGE_MS = 24 * 60 * 60 * 1000;

// These paths must ALWAYS hit the real network.
const NETWORK_ONLY_PREFIXES = [
  "/api/version",              // our deployment-detection poll
  "/api/login",
  "/api/logout",
  "/api/super-admin/login",
  "/api/super-admin/usb",
  "/api/backup",
  "/api/system",
];

function isNetworkOnly(url) {
  return NETWORK_ONLY_PREFIXES.some((p) => url.pathname.startsWith(p));
}

function isApiGet(request, url) {
  return request.method === "GET" && url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  const p = url.pathname;
  return (
    p.includes("/assets/") ||   // Vite hashed chunks
    p.endsWith(".js")  ||
    p.endsWith(".css") ||
    p.endsWith(".woff2") ||
    p.endsWith(".woff")  ||
    p.endsWith(".ttf")   ||
    p.endsWith(".svg")   ||
    p.endsWith(".png")   ||
    p.endsWith(".ico")
  );
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  // Activate immediately — we don't use a precache manifest so there is no
  // risk of serving mixed v1/v2 assets.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Remove any caches from a previous SW version
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== API_CACHE)
            .map((k) => caches.delete(k))
        )
      ),
    ])
  );
});

// ─── Fetch interception ───────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept same-origin requests
  if (url.origin !== self.location.origin) return;

  // Let all non-GET requests pass through unchanged
  if (request.method !== "GET") return;

  // Explicitly network-only routes
  if (isNetworkOnly(url)) return;

  // API reads → stale-while-revalidate
  if (isApiGet(request, url)) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE, MAX_API_AGE_MS));
    return;
  }

  // Versioned static assets → cache-first
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
});

// ─── Strategies ───────────────────────────────────────────────────────────────

/**
 * Stale-while-revalidate:
 *   1. If a fresh-enough cached response exists, return it immediately and
 *      refresh the cache entry in the background.
 *   2. If the cached entry is too old (or absent), fetch from the network,
 *      store the result, and return it.
 *   3. If offline and a cached response exists (even stale), return it.
 *   4. If offline and nothing is cached, return a 503 JSON sentinel so the
 *      ERP can display a friendly offline message.
 */
async function staleWhileRevalidate(request, cacheName, maxAgeMs) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchAndStore = async () => {
    try {
      const response = await fetch(request.clone());
      if (response.ok) {
        // Annotate with cache timestamp
        const body    = await response.clone().arrayBuffer();
        const headers = new Headers(response.headers);
        headers.set("x-sw-cached-at", String(Date.now()));
        const stored = new Response(body, {
          status:     response.status,
          statusText: response.statusText,
          headers,
        });
        await cache.put(request, stored);
      }
      return response;
    } catch {
      return null; // network failure
    }
  };

  if (cached) {
    const cachedAt = Number(cached.headers.get("x-sw-cached-at") ?? "0");
    const age      = Date.now() - cachedAt;

    if (age < maxAgeMs) {
      // Fresh enough — serve from cache and revalidate silently
      void fetchAndStore();
      return cached;
    }
    // Stale — fetch synchronously but fall back to stale if offline
  }

  const fresh = await fetchAndStore();
  if (fresh)  return fresh;
  if (cached) return cached; // offline fallback (even stale is better than nothing)

  return new Response(
    JSON.stringify({ error: "offline", message: "No cached data available." }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * Cache-first:
 *   Return the cached asset immediately.  If not cached yet, fetch, store,
 *   and return.  Hashed filenames mean a stale cache entry is never wrong.
 */
async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const fresh = await fetch(request);
    if (fresh.ok) await cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}
