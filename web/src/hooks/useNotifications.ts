import {
  isPushConfigured,
  registerPushToken,
  setupForegroundMessageHandler,
  unregisterPushToken,
} from "@/core/notification/pushManager";
import { notificationService } from "@/service/notificationService";
import { useXyzen } from "@/store";
import { useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

/**
 * Encapsulates notification state, auto-fetches config, and
 * exposes push enable/disable actions.
 */
export function useNotifications() {
  const {
    notificationEnabled,
    novuAppIdentifier,
    novuApiUrl,
    novuWsUrl,
    pushPermission,
    pushTokenRegistered,
    setNotificationConfig,
    setPushPermission,
    setPushTokenRegistered,
  } = useXyzen(
    useShallow((s) => ({
      notificationEnabled: s.notificationEnabled,
      novuAppIdentifier: s.novuAppIdentifier,
      novuApiUrl: s.novuApiUrl,
      novuWsUrl: s.novuWsUrl,
      pushPermission: s.pushPermission,
      pushTokenRegistered: s.pushTokenRegistered,
      setNotificationConfig: s.setNotificationConfig,
      setPushPermission: s.setPushPermission,
      setPushTokenRegistered: s.setPushTokenRegistered,
    })),
  );

  const token = useXyzen((s) => s.token);
  const fetchedRef = useRef(false);

  // Fetch notification config once after login
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
      })
      .catch(() => {
        // Silently ignore — notifications are optional
      });
  }, [token, setNotificationConfig]);

  // Set up foreground message handler when push is registered
  useEffect(() => {
    if (pushTokenRegistered && isPushConfigured()) {
      void setupForegroundMessageHandler();
    }
  }, [pushTokenRegistered]);

  const enablePush = useCallback(async () => {
    const ok = await registerPushToken();
    if (ok) {
      setPushPermission(Notification.permission);
      setPushTokenRegistered(true);
    }
    return ok;
  }, [setPushPermission, setPushTokenRegistered]);

  const disablePush = useCallback(async () => {
    await unregisterPushToken();
    setPushTokenRegistered(false);
  }, [setPushTokenRegistered]);

  return {
    notificationEnabled,
    novuAppIdentifier,
    novuApiUrl,
    novuWsUrl,
    pushPermission,
    pushTokenRegistered,
    enablePush,
    disablePush,
  };
}
