import { useState } from "react";

interface UseImgToClipboardOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export const useImgToClipboard = (options: UseImgToClipboardOptions = {}) => {
  const [isCopying, setIsCopying] = useState(false);

  const copyImageToClipboard = async (
    imageDataUrl: string,
  ): Promise<boolean> => {
    setIsCopying(true);

    try {
      // 检查是否支持现代的剪贴板API
      if (navigator.clipboard && navigator.clipboard.write) {
        try {
          // 将base64转换为Blob
          const response = await fetch(imageDataUrl);
          const blob = await response.blob();

          // 创建ClipboardItem
          const clipboardItem = new ClipboardItem({
            [blob.type]: blob,
          });

          // 写入剪贴板
          await navigator.clipboard.write([clipboardItem]);

          // 触发成功回调
          options.onSuccess?.();

          return true;
        } catch (clipboardError) {
          console.warn("现代剪贴板API失败，尝试降级方案:", clipboardError);
          // 继续到降级方案
        }
      }

      // 降级方案：使用execCommand
      return new Promise((resolve) => {
        const canvas = document.createElement("canvas");
        const img = new Image();

        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;

          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);

            // 创建临时textarea
            const textarea = document.createElement("textarea");
            textarea.value = canvas.toDataURL();
            textarea.style.position = "fixed";
            textarea.style.left = "-999999px";
            document.body.appendChild(textarea);

            try {
              textarea.select();
              const success = document.execCommand("copy");

              if (success) {
                options.onSuccess?.();
              } else {
                console.error("execCommand复制失败");
              }

              resolve(success);
            } catch (err) {
              console.error("复制到剪贴板失败（降级方案）:", err);
              if (err instanceof Error && options.onError) {
                options.onError(err);
              }
              resolve(false);
            } finally {
              document.body.removeChild(textarea);
            }
          } else {
            resolve(false);
          }
        };

        img.onerror = (err) => {
          console.error("图片加载失败:", err);
          resolve(false);
        };

        img.src = imageDataUrl;
      });
    } catch (err) {
      console.error("复制到剪贴板失败:", err);

      // 触发错误回调
      if (err instanceof Error && options.onError) {
        options.onError(err);
      }

      return false;
    } finally {
      setIsCopying(false);
    }
  };

  return {
    copyImageToClipboard,
    isCopying,
  };
};
