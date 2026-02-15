import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useScreenshot } from "@/hooks/useScreenshot";
import Markdown from "@/lib/Markdown";
import { shareService } from "@/service/shareService";
import type { ChatShareRead } from "@/service/shareService";
import { useXyzen } from "@/store";
import type { Message } from "@/store/types";
import {
  ArrowLeftIcon,
  CheckIcon,
  ClipboardCopyIcon,
  DownloadIcon,
  ImageIcon,
  LinkIcon,
  Loader2Icon,
  Share2Icon,
  UserIcon,
  XIcon,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ChatPreview from "./ChatPreview";

export interface Agent {
  id: string;
  name: string;
  avatar?: string;
  description?: string;
  tags?: string[] | null;
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  currentAgent?: Agent;
  sessionId?: string | null;
  topicId?: string | null;
  title?: string;
}

type ShareTab = "image" | "link";

const Checkbox = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}) => (
  <div
    className="flex items-center gap-2 cursor-pointer select-none"
    onClick={() => onChange(!checked)}
  >
    <div
      className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
        checked
          ? "bg-blue-500 border-blue-500 text-white"
          : "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
      }`}
    >
      {checked && <CheckIcon className="w-3.5 h-3.5" />}
    </div>
    {label && (
      <span className="text-sm text-neutral-700 dark:text-neutral-300">
        {label}
      </span>
    )}
  </div>
);

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  messages,
  currentAgent,
  sessionId,
  topicId,
  title,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ShareTab>("link");
  const [step, setStep] = useState<"selection" | "preview">("selection");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Link sharing state
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [shareResult, setShareResult] = useState<ChatShareRead | null>(null);
  const [copied, setCopied] = useState(false);
  const [allowFork, setAllowFork] = useState(false);

  const screenshotRef = useRef<HTMLDivElement>(null);
  const currentUser = useXyzen((state) => state.user);
  const selectedMessages = messages.filter((m) => selectedIds.has(m.id));

  const {
    screenshotUrl,
    isLoading: isGenerating,
    error: screenshotError,
    capture: takeScreenshot,
    reset: resetScreenshot,
  } = useScreenshot({
    containerRef: screenshotRef,
    scale: 2,
    quality: 1,
    backgroundColor: "#ffffff",
  });

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(messages.map((m) => m.id)));
      setStep("selection");
      setImageUrl(null);
      setError(null);
      setShareResult(null);
      setCopied(false);
      setIsCreatingLink(false);
      setAllowFork(false);
      resetScreenshot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, messages]);

  useEffect(() => {
    if (screenshotUrl) {
      if (
        screenshotUrl.startsWith("data:image/") ||
        screenshotUrl.startsWith("data:image/svg") ||
        screenshotUrl.startsWith("blob:")
      ) {
        setImageUrl(screenshotUrl);
        setError(null);
      } else {
        setError(t("app.share.error.createFailed"));
      }
    }
  }, [screenshotUrl, t]);

  useEffect(() => {
    if (screenshotError) {
      setError(screenshotError.message || t("app.share.error.createFailed"));
    }
  }, [screenshotError, t]);

  const toggleMessage = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleAll = () => {
    if (selectedIds.size === messages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(messages.map((m) => m.id)));
    }
  };

  // ── Image export ──────────────────────────────

  const handleGeneratePreview = async () => {
    if (selectedIds.size === 0) {
      setError(t("app.share.error.noMessages"));
      return;
    }
    setStep("preview");
    setError(null);
    setImageUrl(null);
    resetScreenshot();
    setTimeout(() => {
      generateLongImage();
    }, 500);
  };

  const generateLongImage = async () => {
    if (!screenshotRef.current) return;
    try {
      await takeScreenshot();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("app.share.error.createFailed"),
      );
    }
  };

  const downloadImage = () => {
    if (!imageUrl) return;
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `xyzen-chat-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Link sharing ──────────────────────────────

  const handleGenerateLink = useCallback(async () => {
    if (selectedIds.size === 0) {
      setError(t("app.share.error.noMessages"));
      return;
    }
    if (!sessionId || !topicId) {
      setError(t("app.share.error.createFailed"));
      return;
    }

    setIsCreatingLink(true);
    setError(null);
    setShareResult(null);
    setCopied(false);

    try {
      const result = await shareService.createShare({
        session_id: sessionId,
        topic_id: topicId,
        message_ids: Array.from(selectedIds),
        title: title || currentAgent?.name,
        allow_fork: allowFork,
      });
      setShareResult(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("app.share.error.createFailed"),
      );
    } finally {
      setIsCreatingLink(false);
    }
  }, [
    selectedIds,
    sessionId,
    topicId,
    title,
    currentAgent?.name,
    allowFork,
    t,
  ]);

  const shareUrl = shareResult
    ? `${window.location.origin}/xyzen/og/share/${shareResult.token}`
    : "";

  const handleCopyLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for insecure contexts
      const textarea = document.createElement("textarea");
      textarea.value = shareUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareUrl]);

  const handleRevokeLink = useCallback(async () => {
    if (!shareResult) return;
    try {
      await shareService.revokeShare(shareResult.id);
      setShareResult({ ...shareResult, status: "revoked" });
    } catch {
      setError(t("app.share.error.revokeFailed"));
    }
  }, [shareResult, t]);

  // ── Tab bar ──────────────────────────────

  const renderTabBar = () => (
    <div className="flex border-b border-neutral-200 dark:border-neutral-800 px-6">
      <button
        className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
          activeTab === "link"
            ? "border-blue-500 text-blue-600 dark:text-blue-400"
            : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        }`}
        onClick={() => {
          setActiveTab("link");
          setError(null);
        }}
      >
        <LinkIcon className="h-3.5 w-3.5" />
        {t("app.share.tabs.link")}
      </button>
      <button
        className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
          activeTab === "image"
            ? "border-blue-500 text-blue-600 dark:text-blue-400"
            : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        }`}
        onClick={() => {
          setActiveTab("image");
          setError(null);
        }}
      >
        <ImageIcon className="h-3.5 w-3.5" />
        {t("app.share.tabs.image")}
      </button>
    </div>
  );

  // ── Message list (shared between tabs) ──────────────────────────────

  const renderMessageList = () => (
    <div className="flex-1 custom-scrollbar overflow-y-auto p-4 space-y-4 min-h-0 border-b border-neutral-100 dark:border-neutral-800">
      {messages.map((msg) => {
        const isUser = msg.role === "user";
        const isSelected = selectedIds.has(msg.id);
        const robotAvatarUrl =
          currentAgent?.avatar ||
          "https://api.dicebear.com/7.x/avataaars/svg?seed=default";

        return (
          <div
            key={msg.id}
            className={`flex gap-3 p-3 rounded-lg border transition-colors ${
              isSelected
                ? "bg-blue-50/50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800"
                : "bg-transparent border-transparent hover:bg-neutral-50 dark:hover:bg-neutral-900"
            }`}
            onClick={() => toggleMessage(msg.id)}
          >
            <div className="pt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isSelected}
                onChange={() => toggleMessage(msg.id)}
              />
            </div>
            <div className="pt-0.5 shrink-0">
              {isUser ? (
                <div className="w-8 h-8 rounded-full bg-linear-to-tr from-blue-400 to-indigo-500 flex items-center justify-center text-white">
                  <UserIcon className="w-4 h-4" />
                </div>
              ) : (
                <img
                  src={robotAvatarUrl}
                  alt="AI"
                  className="w-8 h-8 rounded-full object-cover"
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                  {isUser
                    ? currentUser?.username || "User"
                    : currentAgent?.name || "AI"}
                </span>
                <span className="text-xs text-neutral-400">
                  {new Date(msg.timestamp || Date.now()).toLocaleTimeString(
                    [],
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )}
                </span>
              </div>
              <div className="text-sm text-neutral-600 dark:text-neutral-300 line-clamp-3 wrap-break-word">
                <div className="prose dark:prose-invert prose-sm max-w-none">
                  <Markdown content={msg.content} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── Selection footer per tab ──────────────────────────────

  const renderSelectionFooter = () => (
    <div className="p-4 bg-white dark:bg-neutral-950 shrink-0 space-y-3">
      {activeTab === "link" && (
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t("app.share.allowFork")}
            </span>
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              {t("app.share.allowForkDescription")}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={allowFork}
            onClick={() => setAllowFork(!allowFork)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              allowFork ? "bg-blue-500" : "bg-neutral-200 dark:bg-neutral-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform ${
                allowFork ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={
              selectedIds.size === messages.length && messages.length > 0
            }
            onChange={toggleAll}
            label={t("app.share.selectAll")}
          />
          <span className="text-sm text-neutral-500 ml-2">
            {t("app.share.selectedCount", { count: selectedIds.size })}
          </span>
        </div>
        {activeTab === "image" ? (
          <Button
            onClick={handleGeneratePreview}
            disabled={selectedIds.size === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {t("app.share.generateImage")}
          </Button>
        ) : (
          <Button
            onClick={handleGenerateLink}
            disabled={selectedIds.size === 0 || isCreatingLink || !sessionId}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isCreatingLink ? (
              <>
                <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                {t("app.share.generating")}
              </>
            ) : (
              <>
                <LinkIcon className="h-4 w-4 mr-2" />
                {t("app.share.generateLink")}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );

  // ── Link result view ──────────────────────────────

  const renderLinkResult = () => (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="space-y-4">
          {/* Success state */}
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckIcon className="h-5 w-5" />
            <span className="font-medium">{t("app.share.linkReady")}</span>
          </div>

          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {t("app.share.linkDescription")}
          </p>

          {/* Link display + copy */}
          <div className="flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-3">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 bg-transparent text-sm text-neutral-800 dark:text-neutral-200 outline-none min-w-0"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="shrink-0"
            >
              {copied ? (
                <>
                  <CheckIcon className="h-3.5 w-3.5 mr-1 text-green-500" />
                  {t("app.share.copied")}
                </>
              ) : (
                <>
                  <ClipboardCopyIcon className="h-3.5 w-3.5 mr-1" />
                  {t("app.share.copyLink")}
                </>
              )}
            </Button>
          </div>

          {/* Share info */}
          {shareResult && (
            <div className="text-xs text-neutral-400 dark:text-neutral-500 space-y-1">
              <p>
                {t("app.share.selectedCount", {
                  count: shareResult.message_count,
                })}{" "}
                &middot;{" "}
                {shareResult.status === "revoked"
                  ? t("app.share.revoked")
                  : t("app.share.noExpiry")}
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400 flex items-start gap-2">
              <XIcon className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-950 shrink-0">
        <div className="flex gap-3 flex-wrap">
          <Button
            variant="outline"
            className="flex-1 min-w-[120px]"
            onClick={() => {
              setShareResult(null);
              setError(null);
              setCopied(false);
            }}
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            {t("common.back")}
          </Button>
          {shareResult && shareResult.status === "active" && (
            <Button
              variant="outline"
              className="flex-1 min-w-[120px] text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 dark:text-red-400 dark:border-red-800"
              onClick={handleRevokeLink}
            >
              {t("app.share.revokeLink")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  // ── Image preview (existing) ──────────────────────────────

  const renderPreviewStep = () => (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {isGenerating || (!imageUrl && !error) ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="relative">
              <div className="h-12 w-12 rounded-full border-4 border-neutral-200 dark:border-neutral-700"></div>
              <div className="absolute top-0 left-0 h-12 w-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 animate-pulse">
              {t("app.share.generating")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 overflow-hidden">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={t("app.share.title")}
                  className="w-full h-auto block"
                />
              ) : (
                <div className="p-4 text-center text-neutral-500">
                  {error ? t("app.share.error.createFailed") : ""}
                </div>
              )}
            </div>
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400 flex items-start gap-2">
                <XIcon className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}
      </div>
      {!isGenerating && (imageUrl || error) && (
        <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-950 shrink-0 z-10">
          <div className="flex gap-3 flex-wrap">
            <Button
              variant="outline"
              className="flex-1 min-w-[120px]"
              onClick={() => setStep("selection")}
            >
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              {t("common.back")}
            </Button>
            <Button
              variant="default"
              className="flex-1 min-w-[120px] bg-blue-600 hover:bg-blue-700 dark:text-neutral-50"
              onClick={downloadImage}
              disabled={!imageUrl}
            >
              <DownloadIcon className="h-4 w-4 mr-2" />
              {t("app.share.generateImage")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Main content routing ──────────────────────────────

  const renderContent = () => {
    // Image tab: preview step
    if (activeTab === "image" && step === "preview") {
      return renderPreviewStep();
    }

    // Link tab: result ready
    if (activeTab === "link" && shareResult) {
      return renderLinkResult();
    }

    // Default: selection step (both tabs)
    return (
      <div className="flex flex-col h-full max-h-[60vh]">
        {renderMessageList()}
        {renderSelectionFooter()}
      </div>
    );
  };

  // ── Dialog title ──────────────────────────────

  const getTitle = () => {
    if (activeTab === "image" && step === "preview") {
      return title || t("app.share.title");
    }
    if (activeTab === "link" && shareResult) {
      return t("app.share.linkReady");
    }
    return t("app.share.selectMessages");
  };

  return (
    <>
      {/* Hidden screenshot container */}
      <div
        ref={screenshotRef}
        aria-hidden="true"
        className="bg-white dark:bg-neutral-800 pointer-events-none screenshot-container custom-scrollbar"
        style={{
          maxWidth: "600px",
          width: "600px",
          position: "fixed",
          left: "-9999px",
          top: "0",
          zIndex: -1,
          opacity: 0,
          visibility: "hidden",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <style>{`
          .screenshot-container pre,
          .screenshot-container code,
          .screenshot-container .shiki,
          .screenshot-container .shiki-container pre {
            white-space: pre-wrap !important;
            word-break: break-all !important;
            overflow: visible !important;
            max-width: 100% !important;
            background-color: transparent !important;
            height: auto !important;
          }
        `}</style>
        <ChatPreview
          messages={selectedMessages.map((msg) => ({
            ...msg,
            created_at: String(
              typeof msg.timestamp === "number" ? msg.timestamp : Date.now(),
            ),
          }))}
          currentAgent={
            currentAgent as import("@/types/agents").Agent | undefined
          }
          currentUser={currentUser}
        />
      </div>

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setStep("selection");
            setImageUrl(null);
            setError(null);
            setShareResult(null);
            setCopied(false);
            resetScreenshot();
            onClose();
          }
        }}
      >
        <DialogContent className="sm:max-w-[700px] w-[95vw] sm:w-full gap-0 p-0 overflow-hidden max-h-[80dvh] sm:max-h-[85vh] flex flex-col">
          <DialogHeader className="p-6 pb-3 shrink-0">
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              <Share2Icon className="h-5 w-5" />
              {getTitle()}
            </DialogTitle>
          </DialogHeader>

          {/* Tab bar (only shown during selection) */}
          {!(activeTab === "image" && step === "preview") &&
            !(activeTab === "link" && shareResult) &&
            renderTabBar()}

          {renderContent()}
        </DialogContent>
      </Dialog>
    </>
  );
};

// Share button component
interface ShareButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export const ShareButton: React.FC<ShareButtonProps> = ({
  onClick,
  disabled = false,
}) => {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      className="h-8 w-8"
      title="Share"
      aria-label="Share"
    >
      <Share2Icon className="h-4 w-4" />
      <span className="sr-only">Share</span>
    </Button>
  );
};
