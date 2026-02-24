import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
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
import { AnimatePresence, motion } from "framer-motion";
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
    <motion.div
      animate={
        checked
          ? {
              backgroundColor: "rgb(99 102 241)",
              borderColor: "rgb(99 102 241)",
            }
          : { backgroundColor: "transparent", borderColor: "rgb(163 163 163)" }
      }
      transition={{ duration: 0.15 }}
      className="w-[18px] h-[18px] rounded-md border flex items-center justify-center dark:border-neutral-600"
    >
      <AnimatePresence>
        {checked && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            <CheckIcon className="w-3 h-3 text-white" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
    {label && (
      <span className="text-[13px] text-neutral-600 dark:text-neutral-400">
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
      // Serialize selected messages for the snapshot (only fields needed for rendering)
      const snapshot = selectedMessages.map((msg) => {
        // Collect toolCalls: prefer message-level, otherwise extract from agentExecution phases
        let toolCalls = msg.toolCalls;
        if (
          (!toolCalls || toolCalls.length === 0) &&
          msg.agentExecution?.phases
        ) {
          const phaseToolCalls = msg.agentExecution.phases.flatMap(
            (p) => p.toolCalls ?? [],
          );
          if (phaseToolCalls.length > 0) toolCalls = phaseToolCalls;
        }

        return {
          id: msg.id,
          role: msg.role,
          content: msg.content,
          thinking_content: msg.thinkingContent,
          toolCalls,
          agentExecution: msg.agentExecution,
          timestamp: msg.timestamp,
        };
      });

      const result = await shareService.createShare({
        session_id: sessionId,
        topic_id: topicId,
        messages_snapshot: snapshot as Record<string, unknown>[],
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
    selectedMessages,
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

  // ── Determine which view is active ──────────────────────────────

  const isSelectionView =
    !(activeTab === "image" && step === "preview") &&
    !(activeTab === "link" && shareResult);

  // ── Tab bar ──────────────────────────────

  const renderTabBar = () => (
    <div className="flex gap-1 px-5 pt-1 pb-3 shrink-0">
      {(["link", "image"] as const).map((tab) => {
        const isActive = activeTab === tab;
        const Icon = tab === "link" ? LinkIcon : ImageIcon;
        return (
          <button
            key={tab}
            className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
              isActive
                ? "text-neutral-900 dark:text-white"
                : "text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
            }`}
            onClick={() => {
              setActiveTab(tab);
              setError(null);
            }}
          >
            {isActive && (
              <motion.div
                layoutId="share-tab-bg"
                className="absolute inset-0 rounded-lg bg-neutral-100/80 dark:bg-white/[0.08]"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5" />
              {t(`app.share.tabs.${tab}`)}
            </span>
          </button>
        );
      })}
    </div>
  );

  // ── Message list ──────────────────────────────

  const renderMessageList = () => (
    <div className="flex-1 custom-scrollbar overflow-y-auto px-4 py-2 space-y-1 min-h-0">
      {messages.map((msg, index) => {
        const isUser = msg.role === "user";
        const isSelected = selectedIds.has(msg.id);
        const robotAvatarUrl =
          currentAgent?.avatar ||
          "https://api.dicebear.com/7.x/avataaars/svg?seed=default";

        return (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.02, 0.3), duration: 0.2 }}
            className={`flex gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
              isSelected
                ? "bg-indigo-50/60 dark:bg-indigo-500/[0.08]"
                : "hover:bg-neutral-50 dark:hover:bg-white/[0.03]"
            }`}
            onClick={() => toggleMessage(msg.id)}
          >
            <div
              className="pt-0.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={isSelected}
                onChange={() => toggleMessage(msg.id)}
              />
            </div>
            <div className="pt-0.5 shrink-0">
              {isUser ? (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white shadow-sm shadow-indigo-500/20">
                  <UserIcon className="w-3.5 h-3.5" />
                </div>
              ) : (
                <img
                  src={robotAvatarUrl}
                  alt="AI"
                  className="w-7 h-7 rounded-full object-cover"
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-medium text-[13px] text-neutral-800 dark:text-neutral-200">
                  {isUser
                    ? currentUser?.username || "User"
                    : currentAgent?.name || "AI"}
                </span>
                <span className="text-[11px] text-neutral-300 dark:text-neutral-600">
                  {new Date(msg.timestamp || Date.now()).toLocaleTimeString(
                    [],
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )}
                </span>
              </div>
              <div className="text-[13px] text-neutral-500 dark:text-neutral-400 line-clamp-3 wrap-break-word">
                <div className="prose dark:prose-invert prose-sm max-w-none">
                  <Markdown content={msg.content} />
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );

  // ── Selection footer ──────────────────────────────

  const renderSelectionFooter = () => (
    <div className="px-5 py-3.5 shrink-0 space-y-3 border-t border-neutral-100/80 dark:border-white/[0.04]">
      {activeTab === "link" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="flex items-center justify-between"
        >
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
              {t("app.share.allowFork")}
            </span>
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
              {t("app.share.allowForkDescription")}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={allowFork}
            onClick={() => setAllowFork(!allowFork)}
            className={`relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
              allowFork ? "bg-indigo-500" : "bg-neutral-200 dark:bg-neutral-700"
            }`}
          >
            <motion.span
              animate={{ x: allowFork ? 18 : 2 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="pointer-events-none mt-[2px] inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm"
            />
          </button>
        </motion.div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={
              selectedIds.size === messages.length && messages.length > 0
            }
            onChange={toggleAll}
            label={t("app.share.selectAll")}
          />
          <span className="text-[12px] text-neutral-400 dark:text-neutral-500 tabular-nums">
            {t("app.share.selectedCount", { count: selectedIds.size })}
          </span>
        </div>
        {activeTab === "image" ? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleGeneratePreview}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-indigo-600 dark:hover:bg-indigo-500"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            {t("app.share.generateImage")}
          </motion.button>
        ) : (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleGenerateLink}
            disabled={selectedIds.size === 0 || isCreatingLink || !sessionId}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-indigo-600 dark:hover:bg-indigo-500"
          >
            {isCreatingLink ? (
              <>
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                {t("app.share.generating")}
              </>
            ) : (
              <>
                <LinkIcon className="h-3.5 w-3.5" />
                {t("app.share.generateLink")}
              </>
            )}
          </motion.button>
        )}
      </div>
    </div>
  );

  // ── Link result view ──────────────────────────────

  const renderLinkResult = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col flex-1 min-h-0"
    >
      <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
        <div className="space-y-4">
          {/* Success badge */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="flex items-center gap-2"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/10">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-[14px] font-semibold text-neutral-800 dark:text-neutral-200">
              {t("app.share.linkReady")}
            </span>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-[13px] text-neutral-400 dark:text-neutral-500"
          >
            {t("app.share.linkDescription")}
          </motion.p>

          {/* Link display + copy */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex items-center gap-2 rounded-xl bg-neutral-50/80 p-3 dark:bg-white/[0.04]"
          >
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 bg-transparent text-[13px] text-neutral-700 dark:text-neutral-300 outline-none min-w-0 font-mono"
            />
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleCopyLink}
              className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                copied
                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                  : "bg-white text-neutral-600 shadow-sm shadow-neutral-200/50 hover:bg-neutral-50 dark:bg-white/[0.06] dark:text-neutral-300 dark:shadow-none dark:hover:bg-white/[0.1]"
              }`}
            >
              {copied ? (
                <>
                  <CheckIcon className="h-3 w-3" />
                  {t("app.share.copied")}
                </>
              ) : (
                <>
                  <ClipboardCopyIcon className="h-3 w-3" />
                  {t("app.share.copyLink")}
                </>
              )}
            </motion.button>
          </motion.div>

          {/* Share info */}
          {shareResult && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-[12px] text-neutral-400 dark:text-neutral-500"
            >
              {t("app.share.selectedCount", {
                count: shareResult.message_count,
              })}{" "}
              &middot;{" "}
              {shareResult.status === "revoked"
                ? t("app.share.revoked")
                : t("app.share.noExpiry")}
            </motion.p>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl bg-red-50/80 px-3.5 py-2.5 text-[13px] text-red-600 dark:bg-red-500/[0.08] dark:text-red-400 flex items-start gap-2"
            >
              <XIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3.5 border-t border-neutral-100/80 dark:border-white/[0.04] shrink-0">
        <div className="flex gap-2.5">
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium text-neutral-600 bg-neutral-100/80 hover:bg-neutral-200/70 transition-colors dark:text-neutral-300 dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
            onClick={() => {
              setShareResult(null);
              setError(null);
              setCopied(false);
            }}
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            {t("common.back")}
          </motion.button>
          {shareResult && shareResult.status === "active" && (
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium text-red-500 bg-red-50/80 hover:bg-red-100/70 transition-colors dark:text-red-400 dark:bg-red-500/[0.06] dark:hover:bg-red-500/[0.12]"
              onClick={handleRevokeLink}
            >
              {t("app.share.revokeLink")}
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );

  // ── Image preview ──────────────────────────────

  const renderPreviewStep = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col flex-1 min-h-0"
    >
      <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
        {isGenerating || (!imageUrl && !error) ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4 py-16">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-8 w-8 rounded-full border-2 border-neutral-200 border-t-indigo-500 dark:border-neutral-700 dark:border-t-indigo-400"
            />
            <motion.p
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-[13px] text-neutral-400 dark:text-neutral-500"
            >
              {t("app.share.generating")}
            </motion.p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl overflow-hidden bg-neutral-50/80 dark:bg-white/[0.03]">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={t("app.share.title")}
                  className="w-full h-auto block"
                />
              ) : (
                <div className="p-8 text-center text-[13px] text-neutral-400">
                  {error ? t("app.share.error.createFailed") : ""}
                </div>
              )}
            </div>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-red-50/80 px-3.5 py-2.5 text-[13px] text-red-600 dark:bg-red-500/[0.08] dark:text-red-400 flex items-start gap-2"
              >
                <XIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}
          </div>
        )}
      </div>
      {!isGenerating && (imageUrl || error) && (
        <div className="px-5 py-3.5 border-t border-neutral-100/80 dark:border-white/[0.04] shrink-0">
          <div className="flex gap-2.5">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium text-neutral-600 bg-neutral-100/80 hover:bg-neutral-200/70 transition-colors dark:text-neutral-300 dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
              onClick={() => setStep("selection")}
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" />
              {t("common.back")}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={downloadImage}
              disabled={!imageUrl}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-40 dark:bg-indigo-600 dark:hover:bg-indigo-500"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              {t("app.share.generateImage")}
            </motion.button>
          </div>
        </div>
      )}
    </motion.div>
  );

  // ── Main content routing ──────────────────────────────

  const renderContent = () => {
    if (activeTab === "image" && step === "preview") {
      return renderPreviewStep();
    }
    if (activeTab === "link" && shareResult) {
      return renderLinkResult();
    }
    return (
      <div className="flex flex-col h-full max-h-[55vh]">
        {renderMessageList()}
        {renderSelectionFooter()}
      </div>
    );
  };

  // ── Title ──────────────────────────────

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

      <SheetModal
        isOpen={isOpen}
        onClose={() => {
          setStep("selection");
          setImageUrl(null);
          setError(null);
          setShareResult(null);
          setCopied(false);
          resetScreenshot();
          onClose();
        }}
        mobileHeight="h-[85dvh]"
        desktopClassName="md:h-auto md:max-h-[80vh] md:max-w-[640px]"
      >
        <div className="flex h-full flex-col overflow-hidden">
          {/* Header */}
          <div className="shrink-0 px-5 pt-7 pb-1 md:pt-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-sm shadow-indigo-500/20">
                <Share2Icon className="h-4 w-4 text-white" />
              </div>
              <AnimatePresence mode="wait">
                <motion.h2
                  key={getTitle()}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="text-[16px] font-semibold text-neutral-900 dark:text-white"
                >
                  {getTitle()}
                </motion.h2>
              </AnimatePresence>
            </div>
          </div>

          {/* Tab bar (only shown during selection) */}
          {isSelectionView && renderTabBar()}

          {/* Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeTab}-${step}-${shareResult ? "result" : "select"}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </SheetModal>
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
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-neutral-200"
      title="Share"
      aria-label="Share"
    >
      <Share2Icon className="h-4 w-4" />
      <span className="sr-only">Share</span>
    </motion.button>
  );
};
