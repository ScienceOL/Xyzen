import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useScreenshot } from "@/hooks/useScreenshot";
import { useXyzen } from "@/store";
import type { Message } from "@/store/types";
import { DownloadIcon, Share2Icon, XIcon } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import ChatPreview from "./ChatPreview";
// 临时类型定义，后续根据实际项目结构调整
export interface Agent {
  id: string;
  name: string;
  avatar?: string;
  description?: string;
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  currentAgent?: Agent;
  title?: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  messages,
  currentAgent,
  title = "分享对话",
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const screenshotRef = useRef<HTMLDivElement>(null);

  // 获取当前用户信息
  const currentUser = useXyzen((state) => state.user);

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

  // 确保在模态框打开时重置状态并自动开始生成
  useEffect(() => {
    if (isOpen) {
      console.log("模态框打开，重置状态并自动开始生成");
      setShowPreview(false);
      setImageUrl(null);
      setError(null);
      resetScreenshot();

      // 自动开始生成，稍微延迟以确保 DOM 渲染完成
      const timer = setTimeout(() => {
        generateLongImage();
      }, 500);

      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // 移除 resetScreenshot 依赖，避免不必要的重置

  // 当截图URL更新时，更新本地状态
  useEffect(() => {
    if (screenshotUrl) {
      console.log("screenshotUrl 已更新，设置 showPreview = true");
      console.log("screenshotUrl 内容预览:", screenshotUrl.substring(0, 100));
      // 确保 URL 是有效的 data URL
      if (
        screenshotUrl.startsWith("data:image/") ||
        screenshotUrl.startsWith("data:image/svg")
      ) {
        setImageUrl(screenshotUrl);
        setShowPreview(true);
        setError(null);
      } else {
        console.error(
          "screenshotUrl 不是有效的图片 data URL:",
          screenshotUrl.substring(0, 100),
        );
        setError("生成的图片 URL 格式不正确");
      }
    } else {
      console.log("screenshotUrl 为 null");
    }
  }, [screenshotUrl]);

  // 监听截图错误和成功状态
  useEffect(() => {
    if (screenshotError) {
      console.error("截图错误已更新:", screenshotError);
      setError(screenshotError.message || "生成长图失败");
    }
  }, [screenshotError]);

  // 调试：监听所有相关状态变化
  useEffect(() => {
    console.log("状态更新:", {
      isGenerating,
      showPreview,
      imageUrl: imageUrl ? "存在" : "null",
      screenshotUrl: screenshotUrl ? "存在" : "null",
      error,
      screenshotError: screenshotError?.message,
    });
  }, [
    isGenerating,
    showPreview,
    imageUrl,
    screenshotUrl,
    error,
    screenshotError,
  ]);

  // 生成长图
  const generateLongImage = async () => {
    setError(null);
    setShowPreview(false);
    resetScreenshot();

    console.log("开始生成对话长图");
    console.log("messages 数量:", messages.length);
    console.log("messages 内容:", messages);
    console.log("currentAgent:", currentAgent);

    // 确保元素存在且已渲染
    if (!screenshotRef.current) {
      setError("无法找到预览容器");
      return;
    }

    // 检查元素是否有内容
    if (screenshotRef.current.children.length === 0) {
      console.error("预览容器没有子元素");
      setError("预览内容为空，无法生成截图");
      return;
    }

    console.log("预览容器子元素数量:", screenshotRef.current.children.length);
    console.log(
      "预览容器内容:",
      screenshotRef.current.innerHTML.substring(0, 500),
    );

    // 等待一小段时间确保内容渲染完成
    await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      console.log("开始截图...");
      const url = await takeScreenshot();
      console.log("截图完成，URL:", url ? "存在" : "null");
      console.log("screenshotError:", screenshotError);
      console.log("screenshotUrl:", screenshotUrl);

      // 等待一小段时间让 hook 状态更新
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 如果返回 null 且没有错误信息，设置错误
      if (!url && !screenshotError) {
        console.error("截图返回为空且没有错误信息");
        setError("生成长图失败：截图返回为空，请检查控制台获取详细信息");
      } else if (!url && screenshotError) {
        // screenshotError 会通过 useEffect 自动设置到 error
        console.error("截图失败:", screenshotError);
      }
    } catch (err) {
      console.error("截图异常:", err);
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

  // 直接在AlertDialog的onOpenChange中处理关闭逻辑

  return (
    <>
      <div
        ref={screenshotRef}
        aria-hidden="true"
        className="bg-white dark:bg-neutral-800 pointer-events-none screenshot-container"
        style={{
          maxWidth: "600px",
          width: "600px",
          position: "fixed",
          left: "-9999px", // Move off-screen to prevent flashing
          top: "0",
          zIndex: -1, // Behind everything
          opacity: 0, // Initially hidden
          visibility: "hidden", // Initially hidden
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <style>{`
          .hide-scrollbar::-webkit-scrollbar {
            display: none;
          }
          .hide-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
          /* 截图容器内的代码块强制换行与去背景 */
          .screenshot-container pre,
          .screenshot-container code,
          .screenshot-container .shiki,
          .screenshot-container .shiki-container,
          .screenshot-container .shiki-container pre,
          .screenshot-container .code-block,
          .screenshot-container span {
            white-space: pre-wrap !important;
            word-break: break-all !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            overflow: visible !important;
            overflow-x: visible !important;
            max-width: 100% !important;
            min-width: 0 !important;
            width: 100% !important;
            background-color: transparent !important;
            height: auto !important;
            display: block !important; /* 强制块级显示，确保占满父容器并换行 */
          }

          /* 针对 span 特殊处理，保持 inline 但允许换行 */
          .screenshot-container span {
            display: inline !important;
            width: auto !important;
          }

          /* 专门针对 shiki 的行样式 */
          .screenshot-container .shiki .line {
            white-space: pre-wrap !important;
            display: block !important;
            width: 100% !important;
          }

          /* 强制表格布局的代码块（如果有）也换行 */
          .screenshot-container table,
          .screenshot-container tr,
          .screenshot-container td {
            display: block !important;
            width: 100% !important;
            white-space: pre-wrap !important;
          }

          /* 强制移除滚动条容器的滚动属性 */

          /* 强制移除滚动条容器的滚动属性 */
          .screenshot-container .overflow-x-auto,
          .screenshot-container .custom-scrollbar {
            overflow: visible !important;
            height: auto !important;
          }

          /* 隐藏滚动条本身 */
          .screenshot-container ::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
        `}</style>
        <ChatPreview
          messages={messages.map((msg) => ({
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
            setShowPreview(false);
            setImageUrl(null);
            setError(null);
            resetScreenshot();
            onClose();
          }
        }}
      >
        <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              <Share2Icon className="h-5 w-5" />
              {title}
            </DialogTitle>
          </DialogHeader>

          <div className="p-6">
            {!showPreview ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-4 border-neutral-200 dark:border-neutral-700"></div>
                  <div className="absolute top-0 left-0 h-12 w-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
                </div>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 animate-pulse">
                  正在生成分享...
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 overflow-hidden">
                  <div className="hide-scrollbar relative max-h-[500px] overflow-auto">
                    {imageUrl ? (
                      <>
                        <img
                          src={imageUrl}
                          alt="对话长图预览"
                          className="w-full h-auto object-contain"
                          onLoad={() => console.log("图片加载成功")}
                          onError={(e) => {
                            console.error("图片加载失败:", e);
                            console.error(
                              "imageUrl:",
                              imageUrl.substring(0, 200),
                            );
                          }}
                        />
                      </>
                    ) : (
                      <div className="p-4 text-center text-neutral-500">
                        图片 URL 为空
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <Button
                    variant="default"
                    className="flex justify-center gap-2"
                    onClick={downloadImage}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    下载图片
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                <div className="flex items-start gap-2">
                  <XIcon className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              </div>
            )}
          </div>
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
