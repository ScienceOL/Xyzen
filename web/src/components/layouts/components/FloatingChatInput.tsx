"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/animate-ui/components/animate/tooltip";
import { AutoHeight } from "@/components/animate-ui/primitives/effects/auto-height";
import { FileUploadPreview } from "@/components/features";
import { DragDropOverlay } from "@/components/shared/DragDropOverlay";
import { useFileDragDrop } from "@/hooks/useFileDragDrop";
import { useToolbarState } from "@/hooks/useToolbarState";
import { cn } from "@/lib/utils";
import { useXyzen } from "@/store";
import {
  ArrowPathIcon,
  ChevronDownIcon,
  DocumentTextIcon,
  EllipsisHorizontalIcon,
  PaperAirplaneIcon,
  StopIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import {
  HistorySheetButton,
  McpToolsButton,
  MobileMoreMenu,
  SkillsButton,
  ToolbarActions,
  ToolSelector,
} from "./ChatToolbar/index";
import { KnowledgeButton } from "./ChatToolbar/KnowledgeButton";
import { SandboxButton } from "./ChatToolbar/SandboxButton";
import { ContextUsageBanner } from "./ContextUsageBanner";
import { TierSelector } from "./TierSelector";

interface FloatingChatInputProps {
  onSendMessage: (message: string) => boolean | void;
  disabled?: boolean;
  placeholder?: string;
  initialValue?: string;
  responding?: boolean;
  aborting?: boolean;
  onAbort?: () => void;
  sendBlocked?: boolean;
  // History props
  onShowHistory: () => void;
  showHistory: boolean;
  handleCloseHistory: () => void;
  handleSelectTopic: (topic: string) => void;
}

const toolbarButtonClass = cn(
  "flex h-8 w-8 items-center justify-center rounded-md transition-all duration-200",
  "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900",
  "dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
  "disabled:opacity-50 disabled:cursor-not-allowed",
  "[&>svg]:h-5 [&>svg]:w-5",
);

const PASTE_COLLAPSE_CHARS = 500;
const PASTE_COLLAPSE_LINES = 8;

export const FloatingChatInput: React.FC<FloatingChatInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder,
  initialValue = "",
  responding = false,
  aborting = false,
  onAbort,
  sendBlocked = false,
  onShowHistory,
  showHistory,
  handleCloseHistory,
  handleSelectTopic,
}) => {
  const { t } = useTranslation();
  const [inputMessage, setInputMessage] = useState(initialValue);
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [pastedContent, setPastedContent] = useState<string | null>(null);
  const [isPastedExpanded, setIsPastedExpanded] = useState(false);

  const { addFiles, canAddMoreFiles, fileUploadOptions } = useXyzen(
    useShallow((s) => ({
      addFiles: s.addFiles,
      canAddMoreFiles: s.canAddMoreFiles,
      fileUploadOptions: s.fileUploadOptions,
    })),
  );

  // Toolbar state
  const toolbar = useToolbarState();

  // Translated placeholder
  const finalPlaceholder = responding
    ? t("app.input.respondingPlaceholder")
    : placeholder || t("app.input.placeholder");

  // Drag and drop
  const { isDragging, dragProps } = useFileDragDrop({
    onFilesDropped: async (files) => {
      if (!canAddMoreFiles()) {
        console.error(`Maximum ${fileUploadOptions.maxFiles} files allowed`);
        return;
      }
      try {
        await addFiles(files);
      } catch (error) {
        console.error("Failed to add files:", error);
      }
    },
    disabled,
    maxFiles: fileUploadOptions.maxFiles,
    allowedTypes: fileUploadOptions.allowedTypes,
  });

  // Auto-expand textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 200;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, []);

  // Update input when initialValue changes
  useEffect(() => {
    if (initialValue) {
      setInputMessage(initialValue);
    }
  }, [initialValue]);

  // Adjust height when input changes
  useEffect(() => {
    adjustHeight();
  }, [inputMessage, adjustHeight]);

  // Global Escape to abort
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && responding && !aborting && onAbort) {
        e.preventDefault();
        onAbort();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [responding, aborting, onAbort]);

  const handleSendMessage = useCallback(() => {
    const parts = [pastedContent, inputMessage.trim()].filter(Boolean);
    const fullMessage = parts.join("\n\n");
    if (!fullMessage) return;
    const result = onSendMessage(fullMessage);
    if (result !== false) {
      setInputMessage("");
      setPastedContent(null);
      setIsPastedExpanded(false);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.style.height = "auto";
          el.style.overflowY = "hidden";
        }
      });
    }
  }, [pastedContent, inputMessage, onSendMessage]);

  // Handle paste for images/files
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === "file") {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        if (!canAddMoreFiles()) {
          console.error(`Maximum ${fileUploadOptions.maxFiles} files allowed`);
          return;
        }
        const { allowedTypes } = fileUploadOptions;
        const filteredFiles = allowedTypes
          ? files.filter((file) =>
              allowedTypes.some((allowedType) => {
                if (allowedType.endsWith("/*")) {
                  return file.type.startsWith(allowedType.slice(0, -2));
                }
                return file.type === allowedType;
              }),
            )
          : files;
        if (filteredFiles.length > 0) {
          try {
            await addFiles(filteredFiles);
          } catch (error) {
            console.error("Failed to add pasted files:", error);
          }
        }
      } else {
        const text = e.clipboardData.getData("text/plain");
        if (
          text &&
          (text.length > PASTE_COLLAPSE_CHARS ||
            text.split("\n").length > PASTE_COLLAPSE_LINES)
        ) {
          e.preventDefault();
          setPastedContent((prev) => (prev ? prev + "\n" + text : text));
        }
      }
    },
    [addFiles, canAddMoreFiles, fileUploadOptions],
  );

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && !isComposing) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [isComposing, handleSendMessage],
  );

  return (
    <div className="px-3 pb-3 pt-1" {...dragProps}>
      <AutoHeight
        deps={[
          inputMessage,
          toolbar.uploadedFiles.length,
          sendBlocked,
          pastedContent,
          isPastedExpanded,
        ]}
        style={{ overflow: "visible" }}
      >
        <div
          className={cn(
            "relative rounded-2xl border transition-all duration-200",
            "border-neutral-200/60 bg-white shadow-sm",
            "dark:border-neutral-700/60 dark:bg-neutral-900",
            "focus-within:border-neutral-300/40 focus-within:shadow-[0_0_15px_rgba(0,0,0,0.04),0_0_40px_rgba(0,0,0,0.025)]",
            "dark:focus-within:border-neutral-500/30 dark:focus-within:shadow-[0_0_15px_rgba(255,255,255,0.035),0_0_40px_rgba(255,255,255,0.02)]",
          )}
        >
          {/* Drag & drop overlay */}
          <DragDropOverlay
            isVisible={isDragging}
            maxFiles={fileUploadOptions.maxFiles}
            canAddMore={canAddMoreFiles()}
            className="rounded-2xl"
          />

          {/* File Upload Preview */}
          {toolbar.uploadedFiles.length > 0 && (
            <FileUploadPreview className="border-b border-neutral-200/60 dark:border-neutral-700/60 rounded-t-2xl" />
          )}

          {/* Send blocked warning */}
          {sendBlocked && (
            <div className="mx-3 mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:ring-amber-800/40">
              {t("app.input.respondingPlaceholder")}
            </div>
          )}

          {/* Context usage warning */}
          {toolbar.activeChatChannel && (
            <ContextUsageBanner topicId={toolbar.activeChatChannel} />
          )}

          {/* Pasted content capsule */}
          {pastedContent && (
            <div className="mx-3 mt-2">
              <div className="bg-neutral-100/60 dark:bg-white/[0.04] rounded-lg overflow-hidden">
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
                  onClick={() => setIsPastedExpanded((v) => !v)}
                >
                  <DocumentTextIcon className="h-4 w-4 text-neutral-400 shrink-0" />
                  <span className="text-[13px] text-neutral-600 dark:text-neutral-300 truncate min-w-0 flex-1">
                    {pastedContent.split("\n")[0].slice(0, 80)}
                  </span>
                  <span className="text-xs text-neutral-400 dark:text-neutral-500 shrink-0 tabular-nums whitespace-nowrap">
                    {pastedContent.split("\n").length} lines
                    {" · "}
                    {pastedContent.length >= 1000
                      ? `${(pastedContent.length / 1000).toFixed(1)}k`
                      : pastedContent.length}{" "}
                    chars
                  </span>
                  <ChevronDownIcon
                    className={cn(
                      "h-3.5 w-3.5 text-neutral-400 transition-transform duration-200 shrink-0",
                      isPastedExpanded && "rotate-180",
                    )}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPastedContent(null);
                      setIsPastedExpanded(false);
                    }}
                    className="h-5 w-5 flex items-center justify-center rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200/60 dark:hover:text-neutral-300 dark:hover:bg-white/[0.08] transition-colors shrink-0"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
                <AnimatePresence initial={false}>
                  {isPastedExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-2.5">
                        <textarea
                          value={pastedContent}
                          onChange={(e) =>
                            setPastedContent(e.target.value || null)
                          }
                          className={cn(
                            "w-full resize-none rounded-md bg-white/80 dark:bg-neutral-900/50 px-3 py-2 text-[13px] text-neutral-700 dark:text-neutral-300",
                            "border border-neutral-200/60 dark:border-neutral-700/40",
                            "focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600",
                            "custom-scrollbar",
                          )}
                          rows={Math.min(pastedContent.split("\n").length, 12)}
                          style={{ maxHeight: 240 }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Auto-expanding textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            onPaste={handlePaste}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={finalPlaceholder}
            disabled={disabled}
            className={cn(
              "w-full resize-none bg-transparent px-4 pt-3 pb-2 text-base text-neutral-900 placeholder-neutral-400",
              "focus:outline-none dark:text-white dark:placeholder-neutral-500",
              "caret-orange-600 selection:bg-orange-100 selection:text-orange-900",
              "dark:caret-orange-400 dark:selection:bg-orange-900/90 dark:selection:text-white",
              "custom-scrollbar",
            )}
            style={{
              minHeight: "36px",
              maxHeight: "200px",
              overflowY: "hidden",
            }}
          />

          <TooltipProvider>
            {/* Mobile More Menu */}
            {toolbar.activeChatChannel && toolbar.currentAgent && (
              <MobileMoreMenu
                isOpen={toolbar.showMoreMenu}
                agent={toolbar.currentAgent}
                onUpdateAgent={toolbar.updateAgent}
                mcpInfo={toolbar.currentMcpInfo}
                allMcpServers={toolbar.mcpServers}
                onOpenSettings={() => toolbar.openSettingsModal("mcp")}
                onAgentRefresh={toolbar.fetchAgents}
                sessionKnowledgeSetId={toolbar.currentChannelKnowledgeSetId}
                onUpdateSessionKnowledge={toolbar.handleKnowledgeSetChange}
                sessionSandboxBackend={toolbar.currentChannelSandboxBackend}
                onUpdateSessionSandboxBackend={
                  toolbar.handleSandboxBackendChange
                }
              />
            )}

            {/* Bottom toolbar row */}
            <div className="flex items-center justify-between px-2 py-1.5 gap-2">
              {/* Left: tool buttons */}
              <div className="flex flex-wrap items-center gap-1">
                <ToolbarActions
                  onNewChat={toolbar.handleNewChat}
                  isCreatingNewChat={toolbar.isCreatingNewChat}
                  isUploading={toolbar.isUploading}
                  buttonClassName={toolbarButtonClass}
                />

                {/* Tier Selector */}
                {toolbar.activeChatChannel && toolbar.currentAgent && (
                  <TierSelector
                    currentTier={toolbar.currentSessionTier}
                    onTierChange={toolbar.handleTierChange}
                    maxTier={toolbar.maxTier}
                  />
                )}

                {/* Desktop: Knowledge, Sandbox, Tools, MCP, Skills */}
                <div className="hidden md:flex items-center space-x-1">
                  {toolbar.activeChatChannel && toolbar.currentAgent && (
                    <KnowledgeButton
                      agent={toolbar.currentAgent}
                      onUpdateAgent={toolbar.updateAgent}
                      sessionKnowledgeSetId={
                        toolbar.currentChannelKnowledgeSetId
                      }
                      onUpdateSessionKnowledge={
                        toolbar.handleKnowledgeSetChange
                      }
                      buttonClassName={toolbarButtonClass}
                    />
                  )}

                  {toolbar.activeChatChannel && toolbar.currentAgent && (
                    <SandboxButton
                      agent={toolbar.currentAgent}
                      onUpdateAgent={toolbar.updateAgent}
                      sessionSandboxBackend={
                        toolbar.currentChannelSandboxBackend
                      }
                      onUpdateSessionSandboxBackend={
                        toolbar.handleSandboxBackendChange
                      }
                      buttonClassName={toolbarButtonClass}
                    />
                  )}

                  {toolbar.activeChatChannel && toolbar.currentAgent && (
                    <ToolSelector
                      agent={toolbar.currentAgent}
                      onUpdateAgent={toolbar.updateAgent}
                      buttonClassName={toolbarButtonClass}
                    />
                  )}

                  {toolbar.currentAgent && (
                    <McpToolsButton
                      mcpInfo={
                        toolbar.currentMcpInfo || {
                          agent: toolbar.currentAgent,
                          servers: [],
                        }
                      }
                      allMcpServers={toolbar.mcpServers}
                      agent={toolbar.currentAgent}
                      onUpdateAgent={toolbar.updateAgent}
                      onOpenSettings={() => toolbar.openSettingsModal("mcp")}
                      buttonClassName={toolbarButtonClass}
                    />
                  )}

                  {toolbar.currentAgent && (
                    <SkillsButton
                      agent={toolbar.currentAgent}
                      onAgentRefresh={toolbar.fetchAgents}
                      onUpdateAgent={toolbar.updateAgent}
                      buttonClassName={toolbarButtonClass}
                    />
                  )}
                </div>

                {/* Mobile: more button */}
                <div className="md:hidden relative">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() =>
                          toolbar.setShowMoreMenu(!toolbar.showMoreMenu)
                        }
                        className={cn(
                          toolbarButtonClass,
                          toolbar.showMoreMenu &&
                            "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100",
                        )}
                      >
                        <EllipsisHorizontalIcon className="h-5 w-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t("app.toolbar.more")}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Right: history + send/stop */}
              <div className="flex items-center gap-1">
                <HistorySheetButton
                  isOpen={showHistory}
                  onOpenChange={(open) => {
                    if (open) {
                      onShowHistory();
                    } else {
                      handleCloseHistory();
                    }
                  }}
                  onClose={handleCloseHistory}
                  onSelectTopic={handleSelectTopic}
                  buttonClassName={toolbarButtonClass}
                />

                {/* Send / Stop button */}
                {responding ? (
                  <Tooltip key="stop">
                    <TooltipTrigger asChild>
                      <button
                        onClick={onAbort}
                        disabled={aborting || !onAbort}
                        className={cn(
                          "relative flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200",
                          aborting
                            ? "text-neutral-300 cursor-not-allowed dark:text-neutral-600"
                            : "text-red-500 hover:bg-red-50 hover:text-red-600 active:scale-95 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300",
                        )}
                        aria-label={
                          aborting
                            ? t("app.input.stopping")
                            : t("app.input.stop")
                        }
                      >
                        {!aborting && (
                          <span className="absolute inset-0 rounded-full border border-transparent border-t-red-500 dark:border-t-red-400 animate-spin" />
                        )}
                        {aborting ? (
                          <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        ) : (
                          <StopIcon className="h-4 w-4" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {aborting
                          ? t("app.input.stopping")
                          : t("app.input.stop")}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip key="send">
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleSendMessage}
                        disabled={
                          disabled || (!inputMessage.trim() && !pastedContent)
                        }
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200",
                          inputMessage.trim()
                            ? "bg-orange-500 text-white hover:bg-orange-600 active:scale-95 shadow-sm"
                            : "text-neutral-400 dark:text-neutral-500 disabled:opacity-30 disabled:cursor-not-allowed",
                        )}
                        aria-label={t("app.input.send")}
                      >
                        <PaperAirplaneIcon className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t("app.input.send")}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </TooltipProvider>
        </div>
      </AutoHeight>
    </div>
  );
};

export default FloatingChatInput;
