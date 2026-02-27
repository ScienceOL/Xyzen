import { useXyzen } from "@/store";
import type {
  TerminalSession,
  TerminalSessionStatus,
} from "@/store/slices/terminalSlice";
import { useTimeAgo } from "@/hooks/useTimeAgo";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightStartOnRectangleIcon,
  XMarkIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { killConnection } from "@/service/terminalService";

// --- 3-color status dot (green / red / amber-pulsing) ---

type DotColor = "green" | "red" | "amber";

function statusToDotColor(status: TerminalSessionStatus): DotColor {
  switch (status) {
    case "connected":
      return "green";
    case "connecting":
    case "reconnecting":
    case "detached":
      return "amber";
    default:
      return "red";
  }
}

const DOT_COLORS: Record<DotColor, { bg: string; shadow?: string }> = {
  green: { bg: "bg-green-500", shadow: "0 0 6px rgba(34,197,94,0.4)" },
  amber: { bg: "bg-amber-500" },
  red: { bg: "bg-red-500" },
};

const dotSpring = { type: "spring" as const, stiffness: 500, damping: 30 };

function SessionDot({ status }: { status: TerminalSessionStatus }) {
  const color = statusToDotColor(status);
  const v = DOT_COLORS[color];
  const isPulsing = color === "amber";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={color}
        className={`h-2 w-2 shrink-0 rounded-full ${v.bg}`}
        initial={{ scale: 0, opacity: 0 }}
        animate={{
          scale: isPulsing ? [1, 1.3, 1] : 1,
          opacity: 1,
          boxShadow: v.shadow ?? "none",
        }}
        exit={{ scale: 0, opacity: 0 }}
        transition={
          isPulsing
            ? {
                scale: { repeat: Infinity, duration: 1.2 },
                opacity: { duration: 0.15 },
              }
            : { ...dotSpring, opacity: { duration: 0.15 } }
        }
      />
    </AnimatePresence>
  );
}

function SessionCard({
  session,
  onAttach,
  onKill,
}: {
  session: TerminalSession;
  onAttach: (id: string) => void;
  onKill: (id: string) => void;
}) {
  const { t } = useTranslation();
  const timeAgo = useTimeAgo(session.createdAt);

  const label = session.command || session.args[0] || "Shell";

  const statusLabel =
    session.status === "exited"
      ? t("terminal.sessions.exited", { code: session.exitCode ?? -1 })
      : session.status === "detached"
        ? t("terminal.sessions.detached")
        : session.status === "error"
          ? (session.errorMsg ?? t("terminal.status.error"))
          : t(`terminal.status.${session.status}`);

  const canAttach =
    session.status === "detached" || session.status === "connected";

  return (
    <motion.div
      className="flex items-center justify-between rounded-lg bg-neutral-100/60 px-3.5 py-3 dark:bg-white/[0.04]"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex items-center gap-2.5 overflow-hidden">
        <SessionDot status={session.status} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
            {label}
          </p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            {timeAgo}
            {session.status !== "connected" &&
              session.status !== "connecting" && <> &middot; {statusLabel}</>}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {canAttach && (
          <motion.button
            type="button"
            className="rounded-lg bg-indigo-500/10 p-1.5 text-indigo-500 transition-colors hover:bg-indigo-500/20 dark:text-indigo-400"
            whileTap={{ scale: 0.92 }}
            onClick={() => onAttach(session.id)}
            title={t("terminal.sessions.attach")}
          >
            <ArrowRightStartOnRectangleIcon className="h-3.5 w-3.5" />
          </motion.button>
        )}
        <motion.button
          type="button"
          className="rounded-lg bg-red-500/10 p-1.5 text-red-500 transition-colors hover:bg-red-500/20 dark:text-red-400"
          whileTap={{ scale: 0.92 }}
          onClick={() => onKill(session.id)}
          title={t("terminal.sessions.kill")}
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </motion.button>
      </div>
    </motion.div>
  );
}

export function TerminalSessionList({
  onAttach,
  onNewSession,
}: {
  onAttach: (id: string) => void;
  onNewSession: () => void;
}) {
  const { t } = useTranslation();
  const { terminalSessions, removeSession } = useXyzen(
    useShallow((s) => ({
      terminalSessions: s.terminalSessions,
      removeSession: s.removeSession,
    })),
  );

  const sessions = Object.values(terminalSessions);

  const handleKill = (id: string) => {
    killConnection(id);
    removeSession(id);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-5 py-5">
      <div className="w-full max-w-md space-y-2">
        {sessions.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-neutral-400 dark:text-neutral-500">
            {t("terminal.sessions.empty")}
          </p>
        ) : (
          sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onAttach={onAttach}
              onKill={handleKill}
            />
          ))
        )}
        <motion.button
          type="button"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-neutral-100/60 px-3.5 py-3 text-[13px] font-medium text-neutral-500 transition-colors hover:bg-neutral-200/60 dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:bg-white/[0.06]"
          whileTap={{ scale: 0.98 }}
          onClick={onNewSession}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {t("terminal.sessions.new")}
        </motion.button>
      </div>
    </div>
  );
}
