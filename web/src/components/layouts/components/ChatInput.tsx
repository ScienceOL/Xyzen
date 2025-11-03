import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import React, { useState, useEffect } from "react";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  height?: number; // Accept height from parent instead of managing internally
  initialValue?: string; // Add initial value prop
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = "输入消息...",
  height = 80, // Default height if not provided
  initialValue = "",
}) => {
  const [inputMessage, setInputMessage] = useState(initialValue);
  // 添加一个状态来跟踪输入法的组合状态
  const [isComposing, setIsComposing] = useState(false);

  // Use effect to update input when initialValue changes
  useEffect(() => {
    if (initialValue) {
      setInputMessage(initialValue);
    }
  }, [initialValue]);

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;
    onSendMessage(inputMessage);
    setInputMessage("");
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
    <div className="w-full bg-neutral-50/30 dark:bg-neutral-900/20">
      {/* 输入框容器 */}
      <div className="relative flex items-end gap-3 border-t border-neutral-200/40 px-4 py-3 transition-all duration-200 dark:border-neutral-800/40">
        <textarea
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyPress}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={placeholder}
          className="flex-1 resize-none bg-transparent text-[15px] text-neutral-900 placeholder-neutral-400 focus:outline-none dark:text-white dark:placeholder-neutral-500"
          style={{
            height: `${height - 24}px`,
            minHeight: "24px",
          }}
          disabled={disabled}
        />

        {/* 右侧区域：发送按钮和提示在同一行 */}
        <div className="flex-shrink-0 flex items-center gap-3">
          {/* 快捷键提示 - 淡色 */}
          <div className="flex items-center gap-2 text-[11px] text-neutral-400/60 dark:text-neutral-500/60">
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
