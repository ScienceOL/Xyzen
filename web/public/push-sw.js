/**
 * Standard Web Push Service Worker — no Firebase dependency.
 *
 * Handles background push notifications when the app is closed or unfocused.
 * Suppresses notifications when the user is actively viewing the relevant topic
 * (similar to WeChat / Slack behaviour).
 */

// Active topic communicated from the main thread via postMessage.
let _activeTopicId = null;

self.addEventListener("message", (event) => {
  if (event.data?.type === "SET_ACTIVE_TOPIC") {
    _activeTopicId = event.data.topicId ?? null;
  }
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? { title: "Xyzen", body: "" };

  event.waitUntil(
    (async () => {
      // Extract topic ID from the push URL (e.g. "/#/chat/{topicId}")
      const pushUrl = data.url || "";
      const topicMatch = /\/#\/chat\/([a-zA-Z0-9_-]+)/.exec(pushUrl);
      const pushTopicId = topicMatch?.[1] ?? null;

      // If the push targets a specific topic, check whether the user is
      // currently viewing it in a focused window → suppress the notification.
      if (pushTopicId && pushTopicId === _activeTopicId) {
        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        const hasFocusedClient = clients.some(
          (c) => c.visibilityState === "visible",
        );
        if (hasFocusedClient) {
          return; // User is already looking at this topic — stay silent.
        }
      }

      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon || "/icon.png",
        badge: "/icon.png",
        data: { url: data.url || "/" },
      });
    })(),
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
