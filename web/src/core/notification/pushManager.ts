/**
 * FCM push token lifecycle manager.
 *
 * Firebase SDK is loaded lazily so that when the VITE_FIREBASE_* env vars
 * are absent the app never pulls in the Firebase bundle.
 */

import { notificationService } from "@/service/notificationService";

// Cached token so we can remove it on logout
let currentToken: string | null = null;

/**
 * Check whether the Firebase env vars are configured.
 */
export function isPushConfigured(): boolean {
  return !!(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID
  );
}

async function getFirebaseMessaging() {
  const { initializeApp, getApps } = await import("firebase/app");
  const { getMessaging, getToken, onMessage } =
    await import("firebase/messaging");

  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  const app =
    getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  const messaging = getMessaging(app);

  return { messaging, getToken, onMessage };
}

/**
 * Request push permission, retrieve FCM token, and register it with the backend.
 * Returns `true` if the token was successfully registered.
 */
export async function registerPushToken(): Promise<boolean> {
  if (!isPushConfigured()) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const { messaging, getToken } = await getFirebaseMessaging();

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined;
    const token = await getToken(messaging, { vapidKey });

    if (!token) return false;

    await notificationService.registerDeviceToken(token);
    currentToken = token;
    return true;
  } catch (err) {
    console.error("[PushManager] Failed to register push token:", err);
    return false;
  }
}

/**
 * Remove the current FCM token from the backend (call on logout).
 */
export async function unregisterPushToken(): Promise<void> {
  if (!currentToken) return;

  try {
    await notificationService.removeDeviceToken(currentToken);
  } catch (err) {
    console.error("[PushManager] Failed to unregister push token:", err);
  } finally {
    currentToken = null;
  }
}

/**
 * Set up the foreground message handler.
 * When the app is focused, Firebase messages arrive here rather than
 * through the service worker `onBackgroundMessage`.
 *
 * We dispatch a simple browser notification so the user still sees it.
 */
export async function setupForegroundMessageHandler(): Promise<void> {
  if (!isPushConfigured()) return;

  try {
    const { messaging, onMessage } = await getFirebaseMessaging();

    onMessage(messaging, (payload) => {
      const title = payload.notification?.title ?? "Xyzen";
      const body = payload.notification?.body ?? "";

      if (Notification.permission === "granted") {
        new Notification(title, { body, icon: "/icon.png" });
      }
    });
  } catch (err) {
    console.error(
      "[PushManager] Failed to set up foreground message handler:",
      err,
    );
  }
}
