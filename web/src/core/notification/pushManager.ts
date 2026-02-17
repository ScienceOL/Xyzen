/**
 * Web Push subscription lifecycle manager.
 *
 * Uses the standard Web Push API with VAPID keys fetched from the backend —
 * no Firebase dependency, no static env vars.
 */

import { notificationService } from "@/service/notificationService";

/** Cache the VAPID public key after the first fetch. */
let cachedVapidKey: string | null = null;

async function getVapidPublicKey(): Promise<string | null> {
  if (cachedVapidKey) return cachedVapidKey;
  try {
    const config = await notificationService.getConfig();
    cachedVapidKey = config.vapid_public_key || null;
    return cachedVapidKey;
  } catch {
    return null;
  }
}

/** Convert a URL-safe base64 string to a Uint8Array (for applicationServerKey). */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check whether the browser supports the Push API.
 */
export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}

/**
 * Request push permission, subscribe via PushManager, and register with the backend.
 * Returns `true` if the subscription was successfully registered.
 */
export async function registerPushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const vapidKey = await getVapidPublicKey();
    if (!vapidKey) return false;

    const reg = await navigator.serviceWorker.ready;
    const appServerKey = urlBase64ToUint8Array(vapidKey);

    let subscription: PushSubscription;
    try {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });
    } catch (err) {
      // If the server key changed (e.g. different VAPID key pair after
      // redeployment), the browser rejects with InvalidStateError.
      // Unsubscribe the stale subscription and retry.
      if (err instanceof DOMException && err.name === "InvalidStateError") {
        const old = await reg.pushManager.getSubscription();
        if (old) await old.unsubscribe();
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        });
      } else {
        throw err;
      }
    }

    const json = subscription.toJSON();
    await notificationService.registerPushSubscription({
      endpoint: json.endpoint ?? "",
      keys: (json.keys as Record<string, string>) ?? {},
    });
    return true;
  } catch (err) {
    console.error("[PushManager] Failed to register push subscription:", err);
    return false;
  }
}

/**
 * Unsubscribe from Web Push and remove the subscription from the backend.
 */
export async function unregisterPushSubscription(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const subscription = await reg?.pushManager?.getSubscription();
    if (subscription) {
      await notificationService.removePushSubscription(subscription.endpoint);
      await subscription.unsubscribe();
    }
  } catch (err) {
    console.error("[PushManager] Failed to unregister push subscription:", err);
  }
}
