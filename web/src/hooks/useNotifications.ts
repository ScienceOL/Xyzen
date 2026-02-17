import {
  isPushSupported,
  registerPushSubscription,
  unregisterPushSubscription,
} from "@/core/notification/pushManager";
import { notificationService } from "@/service/notificationService";
import { useXyzen } from "@/store";
import { useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

/**
 * Encapsulates notification state, auto-fetches config, and
 * exposes push enable/disable actions.
 *
 * On every login:
 * 1. Fetches notification config from the backend.
 * 2. If the user has already granted notification permission,
 *    silently (re-)subscribes to Web Push so the backend always
 *    has a fresh subscription endpoint.
 */
export function useNotifications() {
  const {
    notificationEnabled,
    novuAppIdentifier,
    novuApiUrl,
    novuWsUrl,
    pushPermission,
    pushSubscribed,
    setNotificationConfig,
    setPushPermission,
    setPushSubscribed,
  } = useXyzen(
    useShallow((s) => ({
      notificationEnabled: s.notificationEnabled,
      novuAppIdentifier: s.novuAppIdentifier,
      novuApiUrl: s.novuApiUrl,
      novuWsUrl: s.novuWsUrl,
      pushPermission: s.pushPermission,
      pushSubscribed: s.pushSubscribed,
      setNotificationConfig: s.setNotificationConfig,
      setPushPermission: s.setPushPermission,
      setPushSubscribed: s.setPushSubscribed,
    })),
  );

  const token = useXyzen((s) => s.token);
  const fetchedRef = useRef(false);

  // Fetch notification config once after login, then auto-resubscribe
  useEffect(() => {
    if (!token || fetchedRef.current) return;
    fetchedRef.current = true;

    notificationService
      .getConfig()
      .then((cfg) => {
        setNotificationConfig(
          cfg.enabled,
          cfg.app_identifier,
          cfg.api_url,
          cfg.ws_url,
        );

        // If the user previously granted permission, silently ensure the
        // push subscription is registered (handles key rotation, new device,
        // expired subscription, etc.)
        if (
          cfg.enabled &&
          isPushSupported() &&
          Notification.permission === "granted"
        ) {
          registerPushSubscription().then((ok) => {
            if (ok) {
              setPushPermission(Notification.permission);
              setPushSubscribed(true);
            }
          });
        }
      })
      .catch(() => {
        // Silently ignore — notifications are optional
      });
  }, [token, setNotificationConfig, setPushPermission, setPushSubscribed]);

  const enablePush = useCallback(async () => {
    if (!isPushSupported()) return false;
    const ok = await registerPushSubscription();
    if (ok) {
      setPushPermission(Notification.permission);
      setPushSubscribed(true);
    }
    return ok;
  }, [setPushPermission, setPushSubscribed]);

  const disablePush = useCallback(async () => {
    await unregisterPushSubscription();
    setPushSubscribed(false);
  }, [setPushSubscribed]);

  return {
    notificationEnabled,
    novuAppIdentifier,
    novuApiUrl,
    novuWsUrl,
    pushPermission,
    pushSubscribed,
    enablePush,
    disablePush,
  };
}
