import { DragDropOverlay } from "@/components/shared/DragDropOverlay";
import { useFileDragDrop } from "@/hooks/useFileDragDrop";
import { useXyzen } from "@/store";
import {
  ArrowPathIcon,
  PaperAirplaneIcon,
  StopIcon,
} from "@heroicons/react/24/outline";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface ChatInputProps {
  onSendMessage: (message: string) => boolean | void;
  disabled?: boolean;
  placeholder?: string;
  height?: number; // Accept height from parent instead of managing internally
  initialValue?: string; // Add initial value prop
  responding?: boolean; // Whether AI is currently generating a response
  aborting?: boolean; // Whether an abort request is in progress
  onAbort?: () => void; // Callback to abort generation
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder,
  height = 100, // Default height if not provided
  initialValue = "",
  responding = false,
  aborting = false,
  onAbort,
}) => {
  const { t } = useTranslation();
  const [inputMessage, setInputMessage] = useState(initialValue);
  // 添加一个状态来跟踪输入法的组合状态
  const [isComposing, setIsComposing] = useState(false);

  const { addFiles, canAddMoreFiles, fileUploadOptions } = useXyzen();

  // Use translated placeholder - different when AI is responding
  const finalPlaceholder = responding
    ? t("app.input.respondingPlaceholder")
    : placeholder || t("app.input.placeholder");

  // Drag and drop functionality
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

  // Use effect to update input when initialValue changes
  useEffect(() => {
    if (initialValue) {
      setInputMessage(initialValue);
    }
  }, [initialValue]);

  // Global keyboard listener for Escape to abort generation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Escape when responding and not already aborting
      if (e.key === "Escape" && responding && !aborting && onAbort) {
        e.preventDefault();
        onAbort();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [responding, aborting, onAbort]);

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;
    const result = onSendMessage(inputMessage);
    if (result !== false) {
      setInputMessage("");
    }
  };

  // Handle paste events for images/files
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];

    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const file = items[i].getAsFile();
        if (file) {
          files.push(file);
        }
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
        ? files.filter((file) => {
            return allowedTypes.some((allowedType) => {
              if (allowedType.endsWith("/*")) {
                const prefix = allowedType.slice(0, -2);
                return file.type.startsWith(prefix);
              }
              return file.type === allowedType;
            });
          })
        : files;

      if (filteredFiles.length > 0) {
        try {
          await addFiles(filteredFiles);
        } catch (error) {
          console.error("Failed to add pasted files:", error);
        }
      }
    }
  };

  // 处理输入法组合开始事件
  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  // 处理输入法组合结束事件
  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  // Handle Enter key to send message
  const handleKeyPress = (e: React.KeyboardEvent) => {
    // 如果是在输入法组合状态中，不处理回车键事件
    if (e.key === "Enter" && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div
      className="relative w-full bg-neutral-50/30 dark:bg-neutral-900/20"
      {...dragProps}
    >
      {/* Drag and drop overlay */}
      <DragDropOverlay
        isVisible={isDragging}
        title="Drop files here"
        maxFiles={fileUploadOptions.maxFiles}
        canAddMore={canAddMoreFiles()}
      />

      {/* 输入框容器 */}
      <div
        className="relative flex flex-col border-t border-neutral-200/40 px-4 py-3 transition-colors duration-200 dark:border-neutral-800/40"
        style={{ height: `${height}px` }}
      >
        <textarea
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyPress}
          onPaste={handlePaste}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={finalPlaceholder}
          wrap="soft"
          className="w-full flex-1 resize-none bg-transparent text-base font-normal focus:font-medium text-neutral-900 placeholder-neutral-400 focus:outline-none dark:text-white dark:placeholder-neutral-500 overflow-y-auto overflow-x-hidden caret-orange-600 selection:bg-orange-100 selection:text-orange-900 dark:caret-orange-400 dark:selection:bg-orange-900/90 dark:selection:text-white"
          style={{
            minHeight: "48px",
            boxSizing: "border-box",
          }}
          disabled={disabled}
        />

        {/* 底部工具栏 */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {/* 快捷键提示 - 淡色，移动端隐藏 */}
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-neutral-400/60 dark:text-neutral-500/60">
            {responding ? (
              // Show Escape hint when responding
              <span className="flex items-center gap-1">
                <kbd className="font-medium text-neutral-400/80 dark:text-neutral-500/80">
                  Esc
                </kbd>
                <span>{t("app.input.escToStop")}</span>
              </span>
            ) : (
              // Show normal hints when not responding
              <>
                <span className="flex items-center gap-1">
                  <kbd className="font-medium text-neutral-400/80 dark:text-neutral-500/80">
                    Enter
                  </kbd>
                  <span>{t("app.input.enterToSend")}</span>
                </span>
                <span className="text-neutral-300/50 dark:text-neutral-700/50">
                  ·
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="font-medium text-neutral-400/80 dark:text-neutral-500/80">
                    Shift + Enter
                  </kbd>
                  <span>{t("app.input.shiftEnterForNewline")}</span>
                </span>
              </>
            )}
          </div>

          {/* 发送按钮 / 停止按钮 */}
          {responding ? (
            <button
              onClick={onAbort}
              disabled={aborting || !onAbort}
              className={`relative rounded-full p-1 transition-all duration-200 ${
                aborting
                  ? "text-neutral-300 cursor-not-allowed dark:text-neutral-600"
                  : "text-red-500 hover:bg-red-50 hover:text-red-600 active:scale-95 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
              }`}
              aria-label={
                aborting ? t("app.input.stopping") : t("app.input.stop")
              }
              title={aborting ? t("app.input.stopping") : t("app.input.stop")}
            >
              {/* Spinning ring animation */}
              {!aborting && (
                <span className="absolute inset-[-2px] rounded-full border border-transparent border-t-red-500 dark:border-t-red-400 animate-spin" />
              )}
              {aborting ? (
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
              ) : (
                <StopIcon className="h-4 w-4" />
              )}
            </button>
          ) : (
            <button
              onClick={handleSendMessage}
              disabled={disabled || !inputMessage.trim()}
              className="rounded-full p-1.5 text-neutral-400 transition-all duration-200 hover:bg-orange-50 hover:text-orange-600 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed dark:text-neutral-500 dark:hover:bg-orange-900/20 dark:hover:text-orange-400"
              aria-label={t("app.input.send")}
            >
              <PaperAirplaneIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
