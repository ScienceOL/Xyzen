import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import React, { useEffect, useState } from "react";
import { useXyzen } from "@/store";
import { useFileDragDrop } from "@/hooks/useFileDragDrop";
import { DragDropOverlay } from "@/components/shared/DragDropOverlay";

interface ChatInputProps {
  onSendMessage: (message: string) => boolean | void;
  disabled?: boolean;
  placeholder?: string;
  height?: number; // Accept height from parent instead of managing internally
  initialValue?: string; // Add initial value prop
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = "输入消息...",
  height = 100, // Default height if not provided
  initialValue = "",
}) => {
  const [inputMessage, setInputMessage] = useState(initialValue);
  // 添加一个状态来跟踪输入法的组合状态
  const [isComposing, setIsComposing] = useState(false);

  const { addFiles, canAddMoreFiles, fileUploadOptions } = useXyzen();

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
      <div className="relative flex border-t border-neutral-200/40 px-4 py-3 transition-all duration-200 dark:border-neutral-800/40">
        <textarea
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyPress}
          onPaste={handlePaste}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={placeholder}
          wrap="soft"
          className="w-full resize-none bg-transparent text-[15px] text-neutral-900 placeholder-neutral-400 focus:outline-none dark:text-white dark:placeholder-neutral-500 overflow-y-auto overflow-x-hidden"
          style={{
            height: `${height - 24}px`,
            minHeight: "24px",
            boxSizing: "border-box",
          }}
          disabled={disabled}
        />

        {/* 右侧区域:发送按钮和提示在同一行 - 绝对定位 */}
        <div className="absolute right-4 bottom-3 flex items-center gap-3 whitespace-nowrap">
          {/* 快捷键提示 - 淡色，移动端隐藏 */}
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-neutral-400/60 dark:text-neutral-500/60">
            <span className="flex items-center gap-1">
              <kbd className="font-medium text-neutral-400/80 dark:text-neutral-500/80">
                Enter
              </kbd>
              <span>发送</span>
            </span>
            <span className="text-neutral-300/50 dark:text-neutral-700/50">
              ·
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-medium text-neutral-400/80 dark:text-neutral-500/80">
                Shift + Enter
              </kbd>
              <span>换行</span>
            </span>
          </div>

          {/* 发送按钮 */}
          <button
            onClick={handleSendMessage}
            disabled={disabled || !inputMessage.trim()}
            className="rounded-full p-2 text-neutral-400 transition-all duration-200 hover:text-neutral-900 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed dark:text-neutral-500 dark:hover:text-white"
            aria-label="发送消息"
          >
            <PaperAirplaneIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
