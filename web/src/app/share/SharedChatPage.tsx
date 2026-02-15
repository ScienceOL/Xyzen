import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import Markdown from "@/lib/Markdown";
import { shareService } from "@/service/shareService";
import type { ChatSharePublicRead } from "@/service/shareService";
import { initiateOAuthLogin } from "@/utils/authFlow";
import {
  ArrowLeftIcon,
  BotIcon,
  Loader2Icon,
  LogInIcon,
  MessageSquarePlusIcon,
  UserIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const PENDING_SHARE_KEY = "pending_share_continue";

/** Save share token so we can auto-continue after OAuth redirect. */
export function savePendingShare(token: string) {
  sessionStorage.setItem(PENDING_SHARE_KEY, token);
}

/** Consume (read + delete) a pending share token, if any. */
export function consumePendingShare(): string | null {
  const token = sessionStorage.getItem(PENDING_SHARE_KEY);
  if (token) sessionStorage.removeItem(PENDING_SHARE_KEY);
  return token;
}

interface SharedChatPageProps {
  token: string;
}

type PageState =
  | { kind: "loading" }
  | { kind: "error"; errorKey: string }
  | { kind: "loaded"; data: ChatSharePublicRead };

export default function SharedChatPage({ token }: SharedChatPageProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [continuing, setContinuing] = useState(false);
  const [continueDone, setContinueDone] = useState(false);
  const autoContinueTriggered = useRef(false);

  // Load share data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await shareService.getSharePublic(token);
        if (!cancelled) setState({ kind: "loaded", data });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("404") || msg.includes("not found")) {
          setState({ kind: "error", errorKey: "app.share.page.notFound" });
        } else if (msg.includes("410")) {
          if (msg.includes("revoked")) {
            setState({ kind: "error", errorKey: "app.share.page.revoked" });
          } else {
            setState({ kind: "error", errorKey: "app.share.page.expired" });
          }
        } else {
          setState({ kind: "error", errorKey: "app.share.page.notFound" });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Auto-continue after returning from OAuth
  useEffect(() => {
    if (
      state.kind === "loaded" &&
      state.data.allow_fork &&
      isAuthenticated &&
      !autoContinueTriggered.current
    ) {
      const pending = consumePendingShare();
      if (pending === token) {
        autoContinueTriggered.current = true;
        void handleContinue();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isAuthenticated, token]);

  const handleContinue = useCallback(async () => {
    if (!isAuthenticated) {
      // Save intent, then redirect to OAuth
      savePendingShare(token);
      try {
        await initiateOAuthLogin();
      } catch {
        // If OAuth redirect fails, clear the pending token
        sessionStorage.removeItem(PENDING_SHARE_KEY);
      }
      return;
    }

    setContinuing(true);
    try {
      const result = await shareService.forkShare(token);
      setContinueDone(true);
      console.log("[SharedChat] Fork succeeded:", result);
      // Navigate to the new conversation
      setTimeout(() => {
        const pendingValue = `${result.session_id}:${result.topic_id}`;
        sessionStorage.setItem("pending_activate_channel", pendingValue);
        // Tell SpatialWorkspace to auto-focus the new agent node
        if (result.agent_id) {
          localStorage.setItem("xyzen_spatial_focused_agent", result.agent_id);
        }
        window.location.hash = "";
        window.location.reload();
      }, 800);
    } catch {
      setContinuing(false);
      alert(t("app.share.page.continueFailed"));
    }
  }, [isAuthenticated, token, t]);

  const handleBack = useCallback(() => {
    window.location.hash = "";
  }, []);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2Icon className="h-5 w-5 animate-spin" />
          <span>{t("app.share.page.loading")}</span>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-lg text-muted-foreground">{t(state.errorKey)}</p>
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            {t("app.share.page.back")}
          </Button>
        </div>
      </div>
    );
  }

  const { data } = state;
  const agentName = (data.agent_snapshot?.name as string | undefined) ?? "AI";
  const agentAvatar = data.agent_snapshot?.avatar as string | undefined;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 backdrop-blur px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={handleBack}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
          <h1 className="truncate text-base font-semibold">
            {data.title || t("app.share.page.title")}
          </h1>
        </div>
        {data.allow_fork && (
          <Button
            onClick={handleContinue}
            disabled={continuing || continueDone}
            size="sm"
            className="shrink-0"
          >
            {continueDone ? (
              t("app.share.page.continueSuccess")
            ) : continuing ? (
              <>
                <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                {t("app.share.page.continueButton")}
              </>
            ) : isAuthenticated ? (
              <>
                <MessageSquarePlusIcon className="h-4 w-4 mr-2" />
                {t("app.share.page.continueButton")}
              </>
            ) : (
              <>
                <LogInIcon className="h-4 w-4 mr-2" />
                {t("app.share.page.continueLoginRequired")}
              </>
            )}
          </Button>
        )}
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-3xl px-4 py-6 space-y-6 sm:px-6">
          {data.messages_snapshot.map((msg, idx) => {
            const role = msg.role as string;
            const content = msg.content as string;
            const isUser = role === "user";

            return (
              <div key={idx} className="flex gap-3">
                <div className="shrink-0 pt-1">
                  {isUser ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-blue-400 to-indigo-500 text-white">
                      <UserIcon className="h-4 w-4" />
                    </div>
                  ) : agentAvatar ? (
                    <img
                      src={agentAvatar}
                      alt={agentName}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-400 to-teal-500 text-white">
                      <BotIcon className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-sm font-semibold text-foreground">
                    {isUser ? "User" : agentName}
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                    <Markdown content={content} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Footer info */}
      {!data.allow_fork && (
        <footer className="border-t px-4 py-3 text-center text-xs text-muted-foreground sm:px-6">
          {t("app.share.page.viewOnly")}
        </footer>
      )}
    </div>
  );
}
