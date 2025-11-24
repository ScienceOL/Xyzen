import { snapdom } from "@zumer/snapdom";
import { useEffect, useState } from "react";
import UPNG from "upng-js";

interface UseScreenshotOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  scale?: number;
  quality?: number;
  backgroundColor?: string;
}

interface UseScreenshotReturn {
  screenshotUrl: string | null;
  isLoading: boolean;
  error: Error | null;
  capture: () => Promise<string | null>;
  reset: () => void;
}

// 辅助函数：等待容器内的所有图片加载完成
const waitForImages = (element: HTMLElement): Promise<void> => {
  const images = Array.from(element.querySelectorAll("img"));
  const promises = images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  });
  return Promise.all(promises).then(() => {});
};

// 辅助函数：将 SVG data URL 转换为 PNG Blob URL (使用 UPNG 进行 256 色压缩)
const convertSvgToPng = (
  svgUrl: string,
  scale: number = 2,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        // 使用 scale 提高 Canvas 分辨率，确保清晰度
        // 如果 scale 小于 2，至少使用 2 以保证基本清晰度
        const outputScale = Math.max(scale, 2);

        canvas.width = img.width * outputScale;
        canvas.height = img.height * outputScale;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("无法获取 Canvas 上下文"));
          return;
        }

        // 绘制白色背景，防止透明背景变黑
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 设置平滑质量为高，确保 SVG 缩放时保持清晰
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // 直接绘制到全尺寸
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // --- 开始使用 UPNG 进行压缩 ---
        console.log("开始进行 UPNG 256色压缩...");
        const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        // UPNG.encode(rgba, width, height, cnum, [dels])
        // cnum = 256 (256色)
        // rgba.buffer 是 ArrayBuffer，UPNG 需要 [ArrayBuffer]
        const pngBuffer = UPNG.encode(
          [rgba.buffer],
          canvas.width,
          canvas.height,
          256,
        );

        // 使用 Blob URL 替代 Base64 Data URL，避免大图导致字符串过长
        const blob = new Blob([pngBuffer], { type: "image/png" });
        const pngUrl = URL.createObjectURL(blob);
        console.log("UPNG 压缩完成");

        resolve(pngUrl);
      } catch (e) {
        console.error("UPNG 压缩失败，回退到普通 PNG", e);
        // 失败回退
        try {
          // 如果 UPNG 失败，尝试直接导出 Canvas
          // 注意：这里可能还是会因为 Canvas 太大而失败
          const canvas = document.createElement("canvas");
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(URL.createObjectURL(blob));
            } else {
              reject(new Error("Canvas toBlob 失败"));
            }
          }, "image/png");
        } catch (e2) {
          reject(e2);
        }
      }
    };
    img.onerror = () => reject(new Error("SVG 图片加载失败"));
    img.src = svgUrl;
  });
};

export const useScreenshot = (
  options: UseScreenshotOptions,
): UseScreenshotReturn => {
  const {
    containerRef,
    scale = 2,
    quality = 1,
    backgroundColor = "#ffffff",
  } = options;
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reset = () => {
    if (screenshotUrl && screenshotUrl.startsWith("blob:")) {
      URL.revokeObjectURL(screenshotUrl);
    }
    setScreenshotUrl(null);
    setError(null);
  };

  const capture = async (): Promise<string | null> => {
    if (!containerRef.current) {
      setError(new Error("Container ref is not available"));
      return null;
    }

    setIsLoading(true);
    setError(null);

    const element = containerRef.current;

    // 保存原始样式
    const originalStyles = {
      bodyOverflow: document.body.style.overflow,
      position: element.style.position,
      left: element.style.left,
      top: element.style.top,
      right: element.style.right,
      bottom: element.style.bottom,
      opacity: element.style.opacity,
      visibility: element.style.visibility,
      zIndex: element.style.zIndex,
      backgroundColor: element.style.backgroundColor,
      width: element.style.width,
      height: element.style.height,
      maxHeight: element.style.maxHeight,
      overflow: element.style.overflow,
    };

    try {
      console.log("开始截图流程...");

      document.body.style.overflow = "hidden";

      // 恢复默认 scale，移除之前的智能降级逻辑以保证清晰度
      const effectiveScale = scale;
      const elementHeight = element.scrollHeight;
      const elementWidth = element.scrollWidth;

      console.log(
        `元素尺寸: ${elementWidth}x${elementHeight}, 使用 Scale: ${effectiveScale}`,
      );

      // 如果元素在屏幕外或不可见，临时移到可见位置但保持隐藏
      const rect = element.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(element);
      const isOffscreen =
        rect.left < -1000 ||
        rect.top < -1000 ||
        rect.left > window.innerWidth ||
        rect.top > window.innerHeight ||
        computedStyle.visibility === "hidden" ||
        parseFloat(computedStyle.opacity) === 0;

      if (isOffscreen) {
        element.style.opacity = "1"; // 必须可见，让 snapdom 能捕获
        element.style.visibility = "visible"; // 必须可见
        element.style.maxHeight = "none";
        element.style.height = "auto";

        // 等待布局重新计算
        await new Promise((resolve) => setTimeout(resolve, 1300));

        // 调整宽度以适应内容
        const realWidth = Math.max(
          element.scrollWidth,
          element.offsetWidth,
          600,
        );
        if (realWidth > 0) {
          element.style.width = `${realWidth}px`;
        }
      }

      element.style.backgroundColor = backgroundColor;
      element.style.overflow = "visible";

      // 等待图片加载
      await waitForImages(element);

      // 等待样式应用和内容渲染
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 使用snapdom捕获元素
      const result = await snapdom(element, {
        scale: effectiveScale, // 使用动态计算的 scale
        quality,
        backgroundColor,
      });

      // 恢复原始样式
      document.body.style.overflow = originalStyles.bodyOverflow;
      Object.assign(element.style, originalStyles);

      if (result) {
        let imageUrl: string | undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resultAny = result as any;

        // 尝试获取图片 URL
        // 优先使用 toPng
        if (typeof resultAny.toPng === "function") {
          try {
            const pngResult = await resultAny.toPng();
            if (typeof pngResult === "string") imageUrl = pngResult;
            else if (pngResult instanceof Blob) {
              // 使用 Blob URL 替代 Base64 Data URL
              imageUrl = URL.createObjectURL(pngResult);
            }
          } catch (e) {
            console.warn("toPng 失败", e);
          }
        }

        // 回退到 url 属性
        if (!imageUrl && resultAny.url) {
          imageUrl = resultAny.url;
        }

        // 最终检查和转换：如果是 SVG，强制转换为 PNG
        if (imageUrl && imageUrl.startsWith("data:image/svg")) {
          console.log("检测到 SVG 格式，正在强制转换为 PNG...");
          try {
            // 传入 effectiveScale 以确保转换后的 PNG 也是高分辨率的
            imageUrl = await convertSvgToPng(imageUrl, effectiveScale);
            console.log("SVG 转 PNG 成功");
          } catch (e) {
            console.error(
              "SVG 转 PNG 失败，将使用原始 SVG（可能导致兼容性问题）",
              e,
            );
          }
        }

        if (imageUrl && typeof imageUrl === "string") {
          setScreenshotUrl(imageUrl);
          return imageUrl;
        }
      }

      throw new Error("Failed to capture screenshot: result is empty");
    } catch (err) {
      // 确保恢复样式
      document.body.style.overflow = originalStyles.bodyOverflow;
      Object.assign(element.style, originalStyles);

      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      console.error("Screenshot capture failed:", error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (screenshotUrl && screenshotUrl.startsWith("blob:")) {
        URL.revokeObjectURL(screenshotUrl);
      }
    };
  }, [screenshotUrl]);

  return {
    screenshotUrl,
    isLoading,
    error,
    capture,
    reset,
  };
};
