import { useNotifications } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import { NOVU_API_URL, NOVU_WS_URL } from "@/configs";
import { Inbox } from "@novu/react";

/**
 * Notification bell + inbox popover powered by Novu.
 *
 * Renders nothing when notifications are disabled or user is not authenticated.
 */
export function NotificationBell() {
  const { notificationEnabled, novuAppIdentifier } = useNotifications();
  const auth = useAuth();

  if (!notificationEnabled || !novuAppIdentifier || !auth.isAuthenticated) {
    return null;
  }

  return (
    <Inbox
      applicationIdentifier={novuAppIdentifier}
      subscriberId={auth.user?.id ?? ""}
      backendUrl={NOVU_API_URL || undefined}
      socketUrl={NOVU_WS_URL || undefined}
    />
  );
}
