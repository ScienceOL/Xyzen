import type { StateCreator } from "zustand";
import type { XyzenState } from "../types";

export interface NotificationSlice {
  notificationEnabled: boolean;
  novuAppIdentifier: string;
  pushPermission: NotificationPermission | "unsupported";
  pushTokenRegistered: boolean;

  setNotificationConfig: (enabled: boolean, appId: string) => void;
  setPushPermission: (perm: NotificationPermission | "unsupported") => void;
  setPushTokenRegistered: (registered: boolean) => void;
}

export const createNotificationSlice: StateCreator<
  XyzenState,
  [["zustand/immer", never]],
  [],
  NotificationSlice
> = (set) => ({
  notificationEnabled: false,
  novuAppIdentifier: "",
  pushPermission:
    typeof Notification !== "undefined"
      ? Notification.permission
      : "unsupported",
  pushTokenRegistered: false,

  setNotificationConfig: (enabled: boolean, appId: string) => {
    set((state) => {
      state.notificationEnabled = enabled;
      state.novuAppIdentifier = appId;
    });
  },

  setPushPermission: (perm: NotificationPermission | "unsupported") => {
    set((state) => {
      state.pushPermission = perm;
    });
  },

  setPushTokenRegistered: (registered: boolean) => {
    set((state) => {
      state.pushTokenRegistered = registered;
    });
  },
});
