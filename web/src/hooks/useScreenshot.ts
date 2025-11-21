import { snapdom } from "@zumer/snapdom";
import { useEffect, useState } from "react";

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
      console.log("元素:", element);
      console.log("元素内容:", element.innerHTML.substring(0, 200));

      // 临时修改样式以确保完整捕获
      document.body.style.overflow = "hidden";

      // 获取元素的原始尺寸（即使元素在屏幕外）
      const rect = element.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(element);
      const elementWidth = rect.width || parseFloat(computedStyle.width) || 420;
      const elementHeight =
        rect.height || parseFloat(computedStyle.height) || element.scrollHeight;

      console.log("元素尺寸:", {
        width: elementWidth,
        height: elementHeight,
        rect,
      });

      // 如果元素在屏幕外或不可见，临时移到可见位置但保持隐藏
      const isOffscreen =
        rect.left < -1000 ||
        rect.top < -1000 ||
        rect.left > window.innerWidth ||
        rect.top > window.innerHeight ||
        computedStyle.visibility === "hidden" ||
        parseFloat(computedStyle.opacity) === 0;

      console.log("元素是否在屏幕外:", isOffscreen);

      if (isOffscreen) {
        // 将元素移到视口内，使用 z-index 隐藏（让 snapdom 能捕获但用户看不到）
        element.style.position = "fixed";
        element.style.left = "0";
        element.style.top = "0";
        element.style.right = "auto";
        element.style.bottom = "auto";
        element.style.opacity = "1"; // 必须可见，让 snapdom 能捕获
        element.style.visibility = "visible"; // 必须可见
        element.style.zIndex = "-9999"; // 放在所有内容下方，用户看不到
        element.style.maxHeight = "none";
        element.style.height = "auto";
        element.style.transform = "none"; // 移除 transform，确保元素在正常位置

        // 等待布局重新计算
        await new Promise((resolve) => setTimeout(resolve, 100));

        // 获取真实尺寸
        const realHeight = Math.max(
          element.scrollHeight,
          element.offsetHeight,
          elementHeight,
        );
        const realWidth = Math.max(
          element.scrollWidth,
          element.offsetWidth,
          elementWidth,
        );

        console.log("真实尺寸:", {
          width: realWidth,
          height: realHeight,
          scrollHeight: element.scrollHeight,
        });

        // 确保元素有明确的尺寸
        if (realWidth > 0) {
          element.style.width = `${realWidth}px`;
        }
        if (realHeight > 0) {
          element.style.height = `${realHeight}px`;
        }

        console.log("已调整元素位置和尺寸");
      }

      element.style.backgroundColor = backgroundColor;
      element.style.overflow = "visible";

      // 等待样式应用和内容渲染
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 再次检查元素尺寸
      const finalRect = element.getBoundingClientRect();
      console.log("最终元素尺寸:", finalRect);
      console.log("元素 scrollHeight:", element.scrollHeight);

      // 使用snapdom捕获元素
      console.log("调用 snapdom...");
      console.log("元素当前状态:", {
        opacity: element.style.opacity,
        visibility: element.style.visibility,
        position: element.style.position,
        transform: element.style.transform,
        width: element.style.width,
        height: element.style.height,
      });

      const result = await snapdom(element, {
        scale,
        quality,
        backgroundColor,
      });
      console.log(
        "snapdom 返回结果:",
        result
          ? typeof result === "string"
            ? "string (data URL)"
            : typeof result === "object"
              ? `object (${result?.constructor?.name})`
              : typeof result
          : "null",
      );

      // 恢复原始样式
      document.body.style.overflow = originalStyles.bodyOverflow;
      Object.assign(element.style, originalStyles);
      console.log("已恢复元素原始样式");

      if (result) {
        let imageUrl: string | undefined;

        console.log("result 类型:", typeof result);
        console.log("result 是否为 Blob:", result instanceof Blob);
        console.log("result 构造函数:", result?.constructor?.name);
        console.log("result 的所有属性:", Object.keys(result));
        console.log("result 的详细信息:", result);

        if (typeof result === "string") {
          imageUrl = result;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const resultAny = result as any;

          // 优先使用 toPng 方法（直接获取 PNG 格式）
          if (typeof resultAny.toPng === "function") {
            console.log("使用 toPng 方法（优先）");
            try {
              const toPngResult = await resultAny.toPng();
              console.log("toPng 返回结果类型:", typeof toPngResult);
              console.log("toPng 返回结果:", toPngResult);
              console.log(
                "toPng 返回结果构造函数:",
                toPngResult?.constructor?.name,
              );

              // toPng 可能返回字符串、对象或其他类型
              let toPngImageUrl: string | undefined;

              if (typeof toPngResult === "string") {
                toPngImageUrl = toPngResult;
                console.log("toPng 返回字符串，直接使用");
              } else if (toPngResult && typeof toPngResult === "object") {
                // 详细检查对象的所有属性（包括不可枚举的）
                console.log(
                  "toPng 返回对象的所有属性:",
                  Object.keys(toPngResult),
                );
                console.log(
                  "toPng 返回对象的所有属性名（包括不可枚举）:",
                  Object.getOwnPropertyNames(toPngResult),
                );
                try {
                  console.log(
                    "toPng 返回对象的 JSON:",
                    JSON.stringify(toPngResult, null, 2),
                  );
                } catch (jsonError) {
                  console.log("无法序列化对象为 JSON:", jsonError);
                }

                // 检查是否是 Promise-like 对象
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const toPngResultAny = toPngResult as any;
                if (typeof toPngResultAny.then === "function") {
                  console.log("toPng 返回的对象可能是 Promise，尝试再次 await");
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const resolved = await (toPngResult as any);
                  console.log("Promise 解析后的结果:", resolved);
                  if (typeof resolved === "string") {
                    toPngImageUrl = resolved;
                  } else {
                    throw new Error("Promise 解析后仍不是字符串");
                  }
                }
              }

              // 如果还没有设置 imageUrl，继续处理对象
              if (
                !toPngImageUrl &&
                toPngResult &&
                typeof toPngResult === "object"
              ) {
                // 如果返回的是对象，检查是否有 url 属性
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const toPngResultAny = toPngResult as any;

                // 检查是否是 HTMLImageElement
                if (toPngResult instanceof HTMLImageElement) {
                  console.log("toPng 返回 HTMLImageElement，使用其 src 属性");
                  if (toPngResult.src && typeof toPngResult.src === "string") {
                    toPngImageUrl = toPngResult.src;
                    console.log("从 HTMLImageElement.src 获取 URL");
                  } else {
                    // 如果 src 还没有加载，等待图片加载完成
                    console.log("等待 HTMLImageElement 图片加载...");
                    toPngImageUrl = await new Promise<string>(
                      (resolve, reject) => {
                        if (toPngResult.complete && toPngResult.src) {
                          resolve(toPngResult.src);
                        } else {
                          toPngResult.onload = () => {
                            if (toPngResult.src) {
                              resolve(toPngResult.src);
                            } else {
                              reject(new Error("HTMLImageElement src 为空"));
                            }
                          };
                          toPngResult.onerror = () => {
                            reject(new Error("HTMLImageElement 加载失败"));
                          };
                          // 设置超时
                          setTimeout(() => {
                            reject(new Error("HTMLImageElement 加载超时"));
                          }, 5000);
                        }
                      },
                    );
                  }
                }
                // 尝试多种方式获取 URL
                else if (typeof toPngResultAny.url === "string") {
                  toPngImageUrl = toPngResultAny.url;
                  console.log("toPng 返回对象，使用其 url 属性");
                } else if (typeof toPngResultAny.src === "string") {
                  toPngImageUrl = toPngResultAny.src;
                  console.log("toPng 返回对象，使用其 src 属性");
                } else if (typeof toPngResultAny.toString === "function") {
                  // 尝试调用 toString
                  const str = toPngResultAny.toString();
                  if (str && str.startsWith("data:")) {
                    toPngImageUrl = str;
                    console.log("toPng 返回对象，使用 toString() 方法");
                  }
                } else if (toPngResult instanceof Blob) {
                  // 如果是 Blob，转换为 data URL
                  console.log("toPng 返回 Blob，转换为 data URL");
                  toPngImageUrl = await new Promise<string>(
                    (resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === "string") {
                          resolve(reader.result);
                        } else {
                          reject(new Error("FileReader 返回了非字符串结果"));
                        }
                      };
                      reader.onerror = () =>
                        reject(new Error("FileReader 读取失败"));
                      reader.readAsDataURL(toPngResult);
                    },
                  );
                }
              } else if (toPngResult !== null && toPngResult !== undefined) {
                throw new Error(
                  `toPng 返回了意外的类型: ${typeof toPngResult}`,
                );
              }

              // 如果成功获取了 imageUrl，使用它；否则回退到原始 result 的 url
              if (toPngImageUrl && typeof toPngImageUrl === "string") {
                imageUrl = toPngImageUrl;
                console.log("toPng 最终 URL 预览:", imageUrl.substring(0, 100));
              } else {
                console.warn("toPng 返回的对象无法处理，回退到使用 result.url");
                if (
                  typeof resultAny.url === "string" &&
                  resultAny.url.startsWith("data:")
                ) {
                  imageUrl = resultAny.url;
                  console.log("回退成功，使用 result.url");
                } else {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const toPngResultForError = toPngResult as any;
                  throw new Error(
                    `toPng 返回了不支持的类型: ${typeof toPngResult}, 属性: ${Object.keys(toPngResultForError).join(", ") || "无"}, 构造函数: ${toPngResultForError?.constructor?.name || "未知"}`,
                  );
                }
              }
            } catch (toPngError) {
              console.error("toPng 调用失败:", toPngError);
              // 如果 toPng 失败，尝试回退到使用 url 属性
              if (
                typeof resultAny.url === "string" &&
                resultAny.url.startsWith("data:")
              ) {
                console.warn("toPng 失败，回退到使用 result.url");
                imageUrl = resultAny.url;
              } else {
                throw toPngError;
              }
            }
          }
          // 方法3: 如果 result 有 url 属性（snapdom 返回的对象通常有这个属性）
          if (
            !imageUrl &&
            typeof resultAny.url === "string" &&
            resultAny.url.startsWith("data:")
          ) {
            console.log("使用 result.url 属性（data URL）");
            if (resultAny.url.startsWith("data:image/svg")) {
              if (typeof resultAny.toBlob === "function") {
                try {
                  const blob = await resultAny.toBlob();
                  imageUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === "string") {
                        resolve(reader.result);
                      } else {
                        reject(new Error("FileReader 返回了非字符串结果"));
                      }
                    };
                    reader.onerror = () =>
                      reject(new Error("FileReader 读取失败"));
                    reader.readAsDataURL(blob);
                  });
                  console.log("SVG 成功使用 toBlob 转换为 PNG");
                } catch (toBlobError) {
                  console.warn("toBlob 转换失败，尝试 toPng:", toBlobError);
                }
              }
              if (!imageUrl && typeof resultAny.toPng === "function") {
                try {
                  const toPngResult = await resultAny.toPng();
                  if (typeof toPngResult === "string") {
                    imageUrl = toPngResult;
                  } else if (toPngResult && typeof toPngResult === "object") {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const toPngResultAny = toPngResult as any;
                    if (typeof toPngResultAny.url === "string") {
                      imageUrl = toPngResultAny.url;
                    } else if (toPngResult instanceof Blob) {
                      imageUrl = await new Promise<string>(
                        (resolve, reject) => {
                          const reader = new FileReader();
                          reader.onload = () => {
                            if (typeof reader.result === "string") {
                              resolve(reader.result);
                            } else {
                              reject(
                                new Error("FileReader 返回了非字符串结果"),
                              );
                            }
                          };
                          reader.onerror = () =>
                            reject(new Error("FileReader 读取失败"));
                          reader.readAsDataURL(toPngResult);
                        },
                      );
                    } else {
                      throw new Error(`toPng 返回了不支持的对象类型`);
                    }
                  } else {
                    throw new Error(
                      `toPng 返回了意外的类型: ${typeof toPngResult}`,
                    );
                  }
                  console.log("SVG 成功转换为 PNG");
                } catch (svgToPngError) {
                  console.warn("SVG 转 PNG 失败，使用原始 SVG:", svgToPngError);
                  imageUrl = resultAny.url;
                }
              } else {
                console.warn(
                  "SVG URL 但没有 toPng 方法，使用原始 SVG（可能显示空白）",
                );
                imageUrl = resultAny.url;
              }
            } else {
              imageUrl = resultAny.url;
            }
          }
          // 方法4: 如果是标准的 Blob
          if (!imageUrl && result instanceof Blob) {
            console.log("使用标准 Blob");
            imageUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === "string") {
                  resolve(reader.result);
                } else {
                  reject(new Error("FileReader 返回了非字符串结果"));
                }
              };
              reader.onerror = () => reject(new Error("FileReader 读取失败"));
              reader.readAsDataURL(result);
            });
          }
          // 如果 result 有 arrayBuffer 方法
          if (!imageUrl && typeof resultAny.arrayBuffer === "function") {
            console.log("使用 arrayBuffer 方法转换为 Blob");
            try {
              const arrayBuffer = await resultAny.arrayBuffer();
              const blob = new Blob([arrayBuffer], { type: "image/png" });
              imageUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === "string") {
                    resolve(reader.result);
                  } else {
                    reject(new Error("FileReader 返回了非字符串结果"));
                  }
                };
                reader.onerror = () => reject(new Error("FileReader 读取失败"));
                reader.readAsDataURL(blob);
              });
            } catch (arrayBufferError) {
              console.error("arrayBuffer 调用失败:", arrayBufferError);
              throw arrayBufferError;
            }
          }
          // 如果所有方法都失败，抛出错误
          if (!imageUrl) {
            throw new Error(
              `无法将 snapdom 返回的结果转换为图片 URL。结果类型: ${typeof result}, 构造函数: ${resultAny?.constructor?.name}, 可用属性: ${Object.keys(resultAny).join(", ")}`,
            );
          }
        }

        console.log(
          "所有处理完成后，imageUrl 最终状态:",
          imageUrl ? "已设置" : "未设置",
        );
        console.log("imageUrl 类型:", typeof imageUrl);
        if (imageUrl) {
          console.log("imageUrl 预览:", imageUrl.substring(0, 100));
        }

        // 确保 imageUrl 是字符串
        if (typeof imageUrl !== "string") {
          console.error("imageUrl 不是字符串:", typeof imageUrl, imageUrl);
          throw new Error(`imageUrl 不是字符串类型: ${typeof imageUrl}`);
        }

        console.log("设置截图 URL:", imageUrl.substring(0, 50) + "...");
        setScreenshotUrl(imageUrl);
        console.log("setScreenshotUrl 已调用");
        return imageUrl;
      }

      throw new Error("Failed to capture screenshot: snapdom returned null");
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
      // data URL 不需要清理，但如果是 object URL 需要取消注释
      // if (screenshotUrl && screenshotUrl.startsWith("blob:")) {
      //   URL.revokeObjectURL(screenshotUrl);
      // }
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
