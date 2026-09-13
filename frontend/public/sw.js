/**
 * KV-Tidal PWA Service Worker
 * - Handles App Shell Caching & Offline Resilience
 * - Renders Rich Media Push Notification Cards on Android & iOS
 * - Manages Deep-linking and Window Focusing on Notification Click
 */

const CACHE_NAME = "kv-tidal-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.ico",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

// Install Event: Cache Core Static Shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.debug("Non-critical cache addAll issue during SW install:", err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event: Clean Outdated Caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Cache-First for static assets, Network-First for dynamic app views
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept or cache audio streams or dynamic backend APIs
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("/stream") ||
    event.request.method !== "GET"
  ) {
    return;
  }

  // Cache-first strategy for static icon/manifest assets
  if (
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkRes;
        });
      })
    );
  }
});

// Push Event: Display Rich Media Cards in Notification Tray
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "KV-Tidal", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "KV-Tidal | Lossless Audio";
  
  // Format notification options (Android renders full image cards, iOS renders standard banners)
  const options = {
    body: data.body || "New high-resolution music available.",
    icon: data.icon || "/icon-192.png",
    badge: "/icon-192.png",
    image: data.image || data.coverUrl || undefined, // Rich card banner for Android
    tag: data.tag || (data.trackId ? `track-${data.trackId}` : "kv-tidal-alert"),
    renotify: true,
    data: {
      url: data.url || (data.trackId ? `/?play=${data.trackId}` : "/"),
      trackId: data.trackId,
      action: data.action,
    },
    // Interactive action buttons (Android Quick Actions)
    actions: [
      {
        action: "play",
        title: "▶ Play Now",
      },
      {
        action: "explore",
        title: "Explore",
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click Event: Deep-link and focus open window
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const action = event.action;
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If a tab is already open, focus it and navigate
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          client.focus();
          if (action) {
            client.postMessage({
              type: "NOTIFICATION_ACTION",
              action,
              data: event.notification.data,
            });
          }
          return;
        }
      }
      // If no window is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
