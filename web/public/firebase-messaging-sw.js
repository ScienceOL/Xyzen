/**
 * Firebase Cloud Messaging Service Worker
 *
 * Handles background push notifications when the app is closed or unfocused.
 * Uses Firebase compat SDK because service workers cannot use ES modules.
 *
 * The env vars below are injected at build time by vite-plugin-pwa's
 * `importScripts` mechanism; for a self-hosted setup they can also be
 * hard-coded here.
 */

// Firebase compat SDK (loaded via importScripts in the SW context)
importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js",
);

// Initialise Firebase — these values must match the main app config
// They are read from the SW's own global scope (set via postMessage or hardcoded)
firebase.initializeApp({
  apiKey: self.__FIREBASE_CONFIG__?.apiKey ?? "",
  projectId: self.__FIREBASE_CONFIG__?.projectId ?? "",
  messagingSenderId: self.__FIREBASE_CONFIG__?.messagingSenderId ?? "",
  appId: self.__FIREBASE_CONFIG__?.appId ?? "",
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? "Xyzen";
  const body = payload.notification?.body ?? "";
  const url = payload.data?.url ?? "/";

  self.registration.showNotification(title, {
    body,
    icon: "/icon.png",
    badge: "/icon.png",
    data: { url },
  });
});

// Handle notification click — open/focus the app at the deep-link URL
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url ?? "/";
  // Build an absolute URL relative to the SW's origin (handles hash routes like /#/chat/{id})
  const targetUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If a window is already open, focus it and navigate
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            client.postMessage({ type: "notification_click", url });
            return;
          }
        }
        // Otherwise open a new window with the full absolute URL
        return self.clients.openWindow(targetUrl);
      }),
  );
});
