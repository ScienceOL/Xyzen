/**
 * Standard Web Push Service Worker — no Firebase dependency.
 *
 * Handles background push notifications when the app is closed or unfocused.
 * Push events fire in both foreground and background; the SW always calls
 * showNotification() so the user sees a system-level notification.
 */

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? { title: "Xyzen", body: "" };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/icon.png",
      badge: "/icon.png",
      data: { url: data.url || "/" },
    }),
  );
});

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
