import type { StateCreator } from "zustand";
import type { XyzenState } from "../types";

export interface NotificationSlice {
  notificationEnabled: boolean;
  novuAppIdentifier: string;
  novuApiUrl: string;
  novuWsUrl: string;
  pushPermission: NotificationPermission | "unsupported";
  pushTokenRegistered: boolean;

  setNotificationConfig: (
    enabled: boolean,
    appId: string,
    apiUrl: string,
    wsUrl: string,
  ) => void;
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
  novuApiUrl: "",
  novuWsUrl: "",
  pushPermission:
    typeof Notification !== "undefined"
      ? Notification.permission
      : "unsupported",
  pushTokenRegistered: false,

  setNotificationConfig: (
    enabled: boolean,
    appId: string,
    apiUrl: string,
    wsUrl: string,
  ) => {
    set((state) => {
      state.notificationEnabled = enabled;
      state.novuAppIdentifier = appId;
      state.novuApiUrl = apiUrl;
      state.novuWsUrl = wsUrl;
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
