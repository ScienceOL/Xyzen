import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useScreenshot } from "@/hooks/useScreenshot";
import Markdown from "@/lib/Markdown";
import { useXyzen } from "@/store";
import type { Message } from "@/store/types";
import {
  ArrowLeftIcon,
  CheckIcon,
  DownloadIcon,
  Share2Icon,
  UserIcon,
  XIcon,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import AvatarComponent from "../shared/AvatarComponent";
import ChatPreview from "./ChatPreview";

// 临时类型定义，后续根据实际项目结构调整
export interface Agent {
  id: string;
  name: string;
  avatar?: string;
  description?: string;
  tags?: string[] | null;
  avatar_background_color?: string | null;
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  currentAgent?: Agent;
  title?: string;
}

// 简单的 Checkbox 组件
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
  title = "分享对话",
}) => {
  const [step, setStep] = useState<"selection" | "preview">("selection");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const screenshotRef = useRef<HTMLDivElement>(null);

  // 获取当前用户信息
  const currentUser = useXyzen((state) => state.user);

  // 计算选中的消息
  const selectedMessages = messages.filter((m) => selectedIds.has(m.id));

  // 使用截图钩子
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

  // 初始化：打开时默认全选
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(messages.map((m) => m.id)));
      setStep("selection");
      setImageUrl(null);
      setError(null);
      resetScreenshot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, messages]);

  // 当截图URL更新时，更新本地状态
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
        setError("生成的图片 URL 格式不正确");
      }
    }
  }, [screenshotUrl]);

  // 监听截图错误
  useEffect(() => {
    if (screenshotError) {
      setError(screenshotError.message || "生成长图失败");
    }
  }, [screenshotError]);

  // 切换消息选择
  const toggleMessage = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // 全选/全不选
  const toggleAll = () => {
    if (selectedIds.size === messages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(messages.map((m) => m.id)));
    }
  };

  // 开始生成预览
  const handleGeneratePreview = async () => {
    if (selectedIds.size === 0) {
      setError("请至少选择一条消息");
      return;
    }
    setStep("preview");
    setError(null);
    setImageUrl(null); // 清空图片，确保进入 Loading 状态
    resetScreenshot(); // 重置截图状态，防止旧的 screenshotUrl 导致 imageUrl 被恢复

    // 延迟一下确保渲染更新，然后生成
    setTimeout(() => {
      generateLongImage();
    }, 500);
  };

  // 生成长图逻辑
  const generateLongImage = async () => {
    if (!screenshotRef.current) return;
    try {
      await takeScreenshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成长图失败");
    }
  };

  // 下载图片
  const downloadImage = () => {
    if (!imageUrl) return;
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `xyzen-chat-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderSelectionStep = () => (
    <div className="flex flex-col h-full max-h-[60vh]">
      {/* 消息列表区域 - 可滚动 */}
      <div className="flex-1 custom-scrollbar overflow-y-auto p-4 space-y-4 min-h-0 border-b border-neutral-100 dark:border-neutral-800">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const isSelected = selectedIds.has(msg.id);

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
              {/* Checkbox */}
              <div
                className="pt-1 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={isSelected}
                  onChange={() => toggleMessage(msg.id)}
                />
              </div>

              {/* 头像 */}
              <div className="pt-0.5 shrink-0">
                {isUser ? (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-400 to-indigo-500 flex items-center justify-center text-white">
                    <UserIcon className="w-4 h-4" />
                  </div>
                ) : (
                  <AvatarComponent
                    avatar={currentAgent?.avatar ?? undefined}
                    backgroundColor={
                      currentAgent?.avatar_background_color ?? undefined
                    }
                    fallbackEmoji={
                      currentAgent?.id ===
                      "00000000-0000-0000-0000-000000000001"
                        ? "🙂"
                        : "😊"
                    }
                    fallbackImageSrc={
                      currentAgent?.id ===
                      "00000000-0000-0000-0000-000000000001"
                        ? "/defaults/agents/avatar1.png"
                        : "/defaults/agents/avatar2.png"
                    }
                    alt="AI"
                    className="w-8 h-8 rounded-full object-cover"
                    containerClassName="w-8 h-8 rounded-full overflow-hidden"
                  />
                )}
              </div>

              {/* 内容预览 */}
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
                      { hour: "2-digit", minute: "2-digit" },
                    )}
                  </span>
                </div>
                <div className="text-sm text-neutral-600 dark:text-neutral-300 line-clamp-3 break-words">
                  {/* 简单渲染 Markdown 内容，移除复杂的样式 */}
                  <div className="prose dark:prose-invert prose-sm max-w-none">
                    <Markdown content={msg.content} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部操作栏 */}
      <div className="p-4 bg-white dark:bg-neutral-950 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={
              selectedIds.size === messages.length && messages.length > 0
            }
            onChange={toggleAll}
            label="全选"
          />
          <span className="text-sm text-neutral-500 ml-2">
            已选 {selectedIds.size} 条
          </span>
        </div>
        <Button
          onClick={handleGeneratePreview}
          disabled={selectedIds.size === 0}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          生成图片预览
        </Button>
      </div>
    </div>
  );

  const renderPreviewStep = () => (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 状态检查：只要没有图片且没有错误，或者正在生成中，就显示 Loading */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {isGenerating || (!imageUrl && !error) ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="relative">
              <div className="h-12 w-12 rounded-full border-4 border-neutral-200 dark:border-neutral-700"></div>
              <div className="absolute top-0 left-0 h-12 w-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 animate-pulse">
              正在生成分享图片...
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 overflow-hidden">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="对话长图预览"
                  className="w-full h-auto block"
                />
              ) : (
                <div className="p-4 text-center text-neutral-500">
                  {error ? "生成失败" : ""}
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

      {/* 底部按钮固定 */}
      {!isGenerating && (imageUrl || error) && (
        <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-950 shrink-0 z-10">
          <div className="flex gap-3 flex-wrap">
            <Button
              variant="outline"
              className="flex-1 min-w-[120px]"
              onClick={() => setStep("selection")}
            >
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              重新选择
            </Button>
            <Button
              variant="default"
              className="flex-1 min-w-[120px] bg-blue-600 hover:bg-blue-700 dark:text-neutral-50"
              onClick={downloadImage}
              disabled={!imageUrl}
            >
              <DownloadIcon className="h-4 w-4 mr-2 " />
              下载图片
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* 隐藏的截图容器：只渲染选中的消息 */}
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

          /* 截图容器内的代码块强制换行与去背景 */
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
            resetScreenshot();
            onClose();
          }
        }}
      >
        <DialogContent className="sm:max-w-[700px] w-[95vw] sm:w-full gap-0 p-0 overflow-hidden max-h-[80dvh] sm:max-h-[85vh] flex flex-col">
          <DialogHeader className="p-6 pb-0 shrink-0">
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              <Share2Icon className="h-5 w-5" />
              {step === "selection" ? "选择要分享的消息" : title}
            </DialogTitle>
          </DialogHeader>

          {step === "selection" ? renderSelectionStep() : renderPreviewStep()}
        </DialogContent>
      </Dialog>
    </>
  );
};

// 分享按钮组件
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
      title="导出聊天记录"
      aria-label="导出聊天记录"
    >
      <Share2Icon className="h-4 w-4" />
      <span className="sr-only">导出聊天记录</span>
    </Button>
  );
};
