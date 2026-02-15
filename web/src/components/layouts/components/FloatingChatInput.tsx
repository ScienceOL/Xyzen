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
  EllipsisHorizontalIcon,
  PaperAirplaneIcon,
  StopIcon,
} from "@heroicons/react/24/outline";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HistorySheetButton,
  McpToolsButton,
  MobileMoreMenu,
  SkillsButton,
  ToolbarActions,
  ToolSelector,
} from "./ChatToolbar/index";
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

  const { addFiles, canAddMoreFiles, fileUploadOptions } = useXyzen();

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
    if (!inputMessage.trim()) return;
    const result = onSendMessage(inputMessage);
    if (result !== false) {
      setInputMessage("");
      // Reset textarea height after clearing
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.style.height = "auto";
          el.style.overflowY = "hidden";
        }
      });
    }
  }, [inputMessage, onSendMessage]);

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
        deps={[inputMessage, toolbar.uploadedFiles.length, sendBlocked]}
        style={{ overflow: "visible" }}
      >
        <div
          className={cn(
            "relative rounded-2xl border transition-all duration-200",
            "border-neutral-200/60 bg-white shadow-sm",
            "dark:border-neutral-700/60 dark:bg-neutral-900",
            "focus-within:border-neutral-300 focus-within:shadow-md focus-within:ring-1 focus-within:ring-neutral-200/50",
            "dark:focus-within:border-neutral-600 dark:focus-within:shadow-lg dark:focus-within:ring-1 dark:focus-within:ring-neutral-700/50",
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
                sessionKnowledgeSetId={toolbar.currentChannelKnowledgeSetId}
                onUpdateSessionKnowledge={toolbar.handleKnowledgeSetChange}
                onAgentRefresh={toolbar.fetchAgents}
                userPlan={toolbar.userPlan}
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

                {/* Desktop: expanded items */}
                <div className="hidden md:flex items-center space-x-1">
                  {toolbar.activeChatChannel && toolbar.currentAgent && (
                    <ToolSelector
                      agent={toolbar.currentAgent}
                      onUpdateAgent={toolbar.updateAgent}
                      hasKnowledgeSet={
                        !!toolbar.currentAgent.knowledge_set_id ||
                        !!toolbar.currentChannelKnowledgeSetId
                      }
                      sessionKnowledgeSetId={
                        toolbar.currentChannelKnowledgeSetId
                      }
                      onUpdateSessionKnowledge={
                        toolbar.handleKnowledgeSetChange
                      }
                      buttonClassName={toolbarButtonClass}
                      userPlan={toolbar.userPlan}
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
                  <Tooltip>
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleSendMessage}
                        disabled={disabled || !inputMessage.trim()}
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
