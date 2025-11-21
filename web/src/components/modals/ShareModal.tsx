import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useImgToClipboard } from "@/hooks/useImgToClipboard";
import { useScreenshot } from "@/hooks/useScreenshot";
import { useXyzen } from "@/store";
import type { Message } from "@/store/types";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  Share2Icon,
  XIcon,
} from "lucide-react";
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

  // 确保在模态框打开时重置状态
  useEffect(() => {
    if (isOpen) {
      console.log("模态框打开，重置状态");
      setShowPreview(false);
      setImageUrl(null);
      setError(null);
      resetScreenshot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // 移除 resetScreenshot 依赖，避免不必要的重置

  // 使用剪贴板钩子
  const { isCopying, copyImageToClipboard } = useImgToClipboard();

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

  // 复制到剪贴板
  const handleCopyToClipboard = async () => {
    if (!imageUrl) return;
    await copyImageToClipboard(imageUrl);
  };

  // 直接在AlertDialog的onOpenChange中处理关闭逻辑

  return (
    <>
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
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
              <div className="space-y-4">
                <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4 text-sm text-neutral-600 dark:text-neutral-400">
                  点击下方按钮生成对话长图，生成后可以预览、下载或复制到剪贴板。
                </div>

                <div
                  ref={screenshotRef}
                  aria-hidden="true"
                  className="bg-white dark:bg-neutral-800 pointer-events-none"
                  style={{
                    maxWidth: "600px",
                    width: "600px",
                    margin: "0 auto",
                    position: "fixed",
                    left: "0",
                    top: "0",
                    zIndex: -9999,
                    opacity: 0, // 默认隐藏，截图时会临时显示
                    visibility: "hidden", // 默认隐藏
                    borderRadius: "12px", // 圆角
                    overflow: "hidden", // 确保圆角生效
                  }}
                >
                  <ChatPreview
                    messages={messages.map((msg) => ({
                      ...msg,
                      created_at: String(
                        typeof msg.timestamp === "number"
                          ? msg.timestamp
                          : Date.now(),
                      ),
                    }))}
                    currentAgent={
                      currentAgent as import("@/types/agents").Agent | undefined
                    }
                    currentUser={currentUser}
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={generateLongImage}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      生成中...
                    </>
                  ) : (
                    <>
                      <Share2Icon className="h-4 w-4 mr-2" />
                      生成对话长图
                    </>
                  )}
                </Button>
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

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="default"
                    className="flex justify-center gap-2"
                    onClick={downloadImage}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    下载图片
                  </Button>

                  <Button
                    variant="secondary"
                    className="flex justify-center gap-2"
                    onClick={handleCopyToClipboard}
                    title={isCopying ? "已复制!" : "复制到剪贴板"}
                  >
                    {isCopying ? (
                      <>
                        <CheckIcon className="h-4 w-4" />
                        已复制
                      </>
                    ) : (
                      <>
                        <CopyIcon className="h-4 w-4" />
                        复制
                      </>
                    )}
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
