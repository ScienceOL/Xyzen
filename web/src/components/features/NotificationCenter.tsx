import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { DOCK_SAFE_AREA } from "@/components/layouts/BottomDock";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useNotifications as useAppNotifications } from "@/hooks/useNotifications";
import { useTimeAgo } from "@/hooks/useTimeAgo";
import { cn } from "@/lib/utils";
import { useXyzen } from "@/store";
import { BellIcon } from "@heroicons/react/24/outline";
import type { Notification } from "@novu/js";
import {
  NovuProvider,
  useCounts,
  useNotifications as useNovuNotifications,
} from "@novu/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  Check,
  CheckCheck,
  Inbox,
  MailOpen,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

type FilterTab = "all" | "unread" | "archived";

const FILTER_TABS: { key: FilterTab; icon: React.ElementType }[] = [
  { key: "all", icon: Inbox },
  { key: "unread", icon: MailOpen },
  { key: "archived", icon: Archive },
];

// ---------------------------------------------------------------------------
// Helpers — parse packed notification body
// ---------------------------------------------------------------------------
// Novu self-hosted v3.x inbox API only returns `body`.  The backend encodes
// metadata after a hidden separator: "visible text\n<!-- meta:{...} -->"

interface ParsedNotification {
  body: string;
  title: string;
  agentName: string;
  agentAvatar: string;
  url: string;
  messageId: string;
}

const META_RE = /\n<!-- meta:(.*?) -->$/;

function parseNotificationBody(raw: string): ParsedNotification {
  const match = META_RE.exec(raw);
  if (!match)
    return {
      body: raw,
      title: "",
      agentName: "",
      agentAvatar: "",
      url: "",
      messageId: "",
    };
  const body = raw.slice(0, match.index);
  try {
    const meta = JSON.parse(match[1]) as Record<string, string>;
    return {
      body,
      title: meta.title ?? "",
      agentName: meta.agent_name ?? "",
      agentAvatar: meta.agent_avatar ?? "",
      url: meta.url ?? "",
      messageId: meta.message_id ?? "",
    };
  } catch {
    return {
      body: raw,
      title: "",
      agentName: "",
      agentAvatar: "",
      url: "",
      messageId: "",
    };
  }
}

// ---------------------------------------------------------------------------
// Unread badge (inside NovuProvider)
// ---------------------------------------------------------------------------

function UnreadBadge() {
  const { counts } = useCounts({ filters: [{ read: false }] });
  const unread = counts?.[0]?.count ?? 0;
  if (unread === 0) return null;

  return (
    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
      {unread > 99 ? "99+" : unread}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Single notification item
// ---------------------------------------------------------------------------

const ACTION_BTN =
  "rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-200/70 hover:text-neutral-600 active:bg-neutral-200/70 dark:hover:bg-neutral-700/50 dark:hover:text-neutral-300";

const NotificationItem = React.memo(function NotificationItem({
  notification,
  isArchivedView,
  onNavigate,
}: {
  notification: Notification;
  isArchivedView?: boolean;
  onNavigate?: (topicId: string, messageId?: string) => void;
}) {
  const timeAgo = useTimeAgo(notification.createdAt);
  const parsed = parseNotificationBody(notification.body ?? "");

  const handleClick = useCallback(async () => {
    if (!notification.isRead) {
      await notification.read();
    }
    const url = parsed.url || notification.redirect?.url;
    if (!url) return;

    // Extract topic_id from /#/chat/{id} or /chat?topic=xxx patterns
    const hashMatch = /\/#\/chat\/([a-zA-Z0-9_-]+)/.exec(url);
    const queryMatch = /[?&]topic=([^&]+)/.exec(url);
    const topicId = hashMatch?.[1] ?? queryMatch?.[1];
    if (topicId && onNavigate) {
      onNavigate(topicId, parsed.messageId || undefined);
    } else {
      // Fallback: use hash navigation for PWA compatibility
      window.location.hash = `#${url}`;
    }
  }, [notification, parsed.url, parsed.messageId, onNavigate]);

  const handleToggleRead = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (notification.isRead) {
        await notification.unread();
      } else {
        await notification.read();
      }
    },
    [notification],
  );

  const handleDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      await notification.delete();
    },
    [notification],
  );

  const handleRestore = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      await notification.unarchive();
    },
    [notification],
  );

  const handleArchive = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      await notification.archive();
    },
    [notification],
  );

  const displayName = parsed.agentName || parsed.title;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 60 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      className={cn(
        "group relative flex cursor-pointer gap-3 px-4 py-3",
        "border-b border-neutral-100 dark:border-neutral-800/60",
        "transition-colors hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40",
        !notification.isRead && "bg-blue-50/40 dark:bg-blue-950/20",
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0 pt-0.5">
        {parsed.agentAvatar ? (
          <img
            src={parsed.agentAvatar}
            alt={displayName}
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-semibold text-white">
            {(displayName || "N").charAt(0).toUpperCase()}
          </div>
        )}
        {!notification.isRead && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500 dark:border-neutral-900" />
        )}
      </div>

      {/* Right side: top-bottom layout */}
      <div className="min-w-0 flex-1">
        {/* Top row: title + time + actions */}
        <div className="flex items-center gap-1">
          {displayName && (
            <p className="truncate text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
              {displayName}
            </p>
          )}
          <span className="flex-shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
            {timeAgo}
          </span>

          {/* Actions (pushed to right) */}
          <div className="ml-auto flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
            {isArchivedView ? (
              <>
                <button
                  onClick={handleRestore}
                  className={ACTION_BTN}
                  title="Restore"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleDelete}
                  className={ACTION_BTN}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleToggleRead}
                  className={ACTION_BTN}
                  title={
                    notification.isRead ? "Mark as unread" : "Mark as read"
                  }
                >
                  {notification.isRead ? (
                    <MailOpen className="h-3.5 w-3.5" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={handleArchive}
                  className={ACTION_BTN}
                  title="Archive"
                >
                  <Archive className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleDelete}
                  className={ACTION_BTN}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Body: full width below */}
        <p
          className={cn(
            "mt-0.5 line-clamp-2 text-[13px] leading-snug",
            displayName
              ? "text-neutral-500 dark:text-neutral-400"
              : "text-neutral-700 dark:text-neutral-300",
          )}
        >
          {parsed.body}
        </p>
      </div>
    </motion.div>
  );
});

// ---------------------------------------------------------------------------
// Notification list panel for a given filter
// ---------------------------------------------------------------------------

function NotificationPanel({
  filter,
  onNavigate,
}: {
  filter: Record<string, boolean>;
  onNavigate?: (topicId: string, messageId?: string) => void;
}) {
  const { t } = useTranslation();
  const {
    notifications,
    isLoading,
    hasMore,
    fetchMore,
    readAll,
    archiveAllRead,
  } = useNovuNotifications(filter);

  const isArchivedView = !!filter.archived;

  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const deleteAllArchived = useCallback(async () => {
    if (!notifications || notifications.length === 0 || isDeletingAll) return;
    setIsDeletingAll(true);
    try {
      await Promise.all(notifications.map((n: Notification) => n.delete()));
    } finally {
      setIsDeletingAll(false);
    }
  }, [notifications, isDeletingAll]);

  // Infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) fetchMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, fetchMore]);

  return (
    <div className="flex h-full flex-col">
      {!isArchivedView && (
        <div className="flex items-center justify-end gap-1 border-b border-neutral-100 px-4 py-1.5 dark:border-neutral-800/60">
          <button
            onClick={() => readAll()}
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800/40 dark:hover:text-neutral-300"
            title={t("notifications.actions.readAll")}
          >
            <CheckCheck className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => archiveAllRead()}
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800/40 dark:hover:text-neutral-300"
            title={t("notifications.actions.archiveRead")}
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {isArchivedView && notifications && notifications.length > 0 && (
        <div className="flex items-center justify-end gap-1 border-b border-neutral-100 px-4 py-1.5 dark:border-neutral-800/60">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                disabled={isDeletingAll}
                className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                title={t("notifications.actions.deleteAll")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="sm:max-w-sm rounded-sm">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-sm">
                  {t("notifications.actions.deleteAll")}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-xs">
                  {t("notifications.actions.deleteAllConfirm")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-8 rounded-sm text-xs">
                  {t("common.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={deleteAllArchived}
                  className="h-8 rounded-sm bg-red-500 text-xs text-white hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500"
                >
                  {t("notifications.actions.confirmDelete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {notifications?.map((n: Notification) => (
            <NotificationItem
              key={n.id}
              notification={n}
              isArchivedView={isArchivedView}
              onNavigate={onNavigate}
            />
          ))}
        </AnimatePresence>

        {isLoading && (
          <div className="space-y-1 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex animate-pulse gap-3 py-3">
                <div className="h-9 w-9 flex-shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-3/4 rounded bg-neutral-200 dark:bg-neutral-700" />
                  <div className="h-3 w-1/2 rounded bg-neutral-200 dark:bg-neutral-700" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && (!notifications || notifications.length === 0) && (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-400 dark:text-neutral-500">
            <BellIcon className="mb-3 h-10 w-10 opacity-40" />
            <p className="text-sm">{t("notifications.empty")}</p>
          </div>
        )}

        {hasMore && <div ref={sentinelRef} className="h-4" />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notification list with controlled tabs (only active panel mounted)
// ---------------------------------------------------------------------------

const FILTER_MAP: Record<FilterTab, Record<string, boolean>> = {
  all: { archived: false },
  unread: { read: false, archived: false },
  archived: { archived: true },
};

function NotificationList({
  onNavigate,
}: {
  onNavigate?: (topicId: string, messageId?: string) => void;
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="px-4 pt-1 pb-1.5">
        <div className="flex rounded-lg bg-neutral-100/80 p-0.5 dark:bg-neutral-800/50">
          {FILTER_TABS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
                activeTab === key
                  ? "text-neutral-900 dark:text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200",
              )}
            >
              {activeTab === key && (
                <motion.div
                  layoutId="notification-tab"
                  className="absolute inset-0 rounded-md bg-white shadow-sm dark:bg-neutral-700"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {t(`notifications.filter.${key}`)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Only the active panel is mounted — guarantees fresh data on tab switch */}
      <NotificationPanel
        key={activeTab}
        filter={FILTER_MAP[activeTab]}
        onNavigate={onNavigate}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bell + drawer (inside NovuProvider)
// ---------------------------------------------------------------------------

function NotificationUI() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const {
    activateChannel,
    setActivePanel,
    requestFocusAgent,
    setMobilePage,
    setMobileCeoOverlay,
    highlightMessage,
  } = useXyzen(
    useShallow((s) => ({
      activateChannel: s.activateChannel,
      setActivePanel: s.setActivePanel,
      requestFocusAgent: s.requestFocusAgent,
      setMobilePage: s.setMobilePage,
      setMobileCeoOverlay: s.setMobileCeoOverlay,
      highlightMessage: s.highlightMessage,
    })),
  );
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  const handleNavigate = useCallback(
    async (topicId: string, messageId?: string) => {
      close();
      setActivePanel("chat");
      if (isMobile) {
        setMobileCeoOverlay(false);
        setMobilePage(1);
      }
      await activateChannel(topicId);
      // Desktop spatial: focus the corresponding agent node
      const channel = useXyzen.getState().channels[topicId];
      if (channel?.agentId) {
        requestFocusAgent(channel.agentId);
      }
      // Scroll to + highlight the specific message
      if (messageId) {
        highlightMessage(messageId);
      }
    },
    [
      close,
      activateChannel,
      setActivePanel,
      requestFocusAgent,
      isMobile,
      setMobilePage,
      setMobileCeoOverlay,
      highlightMessage,
    ],
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, close]);

  return (
    <>
      {/* Bell button */}
      <div className="relative">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={toggle}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="relative flex items-center justify-center h-7 w-7 text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
        >
          <BellIcon className="h-4.5 w-4.5" />
          <UnreadBadge />
        </motion.button>

        {/* Tooltip (desktop only) */}
        <AnimatePresence>
          {hovered && !open && !isMobile && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900"
            >
              {t("notifications.bell.title")}
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900 dark:border-t-neutral-100" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile: SheetModal bottom sheet */}
      {isMobile && (
        <SheetModal
          isOpen={open}
          onClose={close}
          mobileHeight="h-[85vh]"
          size="sm"
        >
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-6 pb-2 md:py-2">
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                {t("notifications.bell.title")}
              </h2>
              <button
                onClick={close}
                className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NotificationList onNavigate={handleNavigate} />
          </div>
        </SheetModal>
      )}

      {/* Desktop: right drawer (portal) */}
      {!isMobile &&
        createPortal(
          <AnimatePresence>
            {open && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-[70]"
                  onClick={close}
                />
                <motion.div
                  key="notification-drawer"
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{
                    type: "spring",
                    damping: 30,
                    stiffness: 300,
                    mass: 0.8,
                  }}
                  className={cn(
                    "fixed top-0 right-0 z-[71] h-full w-[380px]",
                    "bg-white/90 dark:bg-neutral-900/90",
                    "backdrop-blur-2xl",
                    "border-l border-neutral-200/60 dark:border-neutral-700/50",
                    "shadow-2xl",
                    "text-neutral-900 dark:text-neutral-100",
                  )}
                  style={{ paddingBottom: DOCK_SAFE_AREA }}
                >
                  <div className="flex h-full flex-col">
                    <div className="flex items-center justify-between px-5 py-4">
                      <h2 className="text-base font-semibold">
                        {t("notifications.bell.title")}
                      </h2>
                      <button
                        onClick={close}
                        className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <NotificationList onNavigate={handleNavigate} />
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Root: NovuProvider wrapper
// ---------------------------------------------------------------------------

export function NotificationCenter() {
  const { notificationEnabled, novuAppIdentifier, novuApiUrl, novuWsUrl } =
    useAppNotifications();
  const auth = useAuth();

  if (!notificationEnabled || !novuAppIdentifier || !auth.isAuthenticated) {
    return null;
  }

  return (
    <NovuProvider
      applicationIdentifier={novuAppIdentifier}
      subscriberId={auth.user?.id ?? ""}
      backendUrl={novuApiUrl || undefined}
      socketUrl={novuWsUrl || undefined}
    >
      <NotificationUI />
    </NovuProvider>
  );
}
