import { useEffect, useRef, useState } from "react";

interface TypewriterConfig {
  /** 是否启用打字效果 */
  enabled?: boolean;
  /** 渐变动画时长（毫秒），文本从浅色变为深色的时间 */
  fadeDuration?: number;
}

interface TypewriterState {
  /** 当前的透明度（0-1）*/
  opacity: number;
  /** 是否正在接收新内容 */
  isTyping: boolean;
}

/**
 * Typewriter 浮现效果 Hook
 * 参照 lobe-chat 的实现模式
 *
 * 特点：
 * 1. 整个内容块突然以淡色显示
 * 2. 逐渐变为正常颜色（渐变动画）
 * 3. 保持代码结构完整，不破坏格式化
 *
 * @param fullText - 完整文本
 * @param isStreaming - 是否正在流式接收
 * @param config - 配置选项
 * @returns 打字效果状态和控制方法
 */
export function useTypewriterEffect(
  fullText: string,
  isStreaming: boolean,
  config: TypewriterConfig = {},
): TypewriterState {
  const { enabled = true, fadeDuration = 300 } = config;

  const [opacity, setOpacity] = useState(1);
  const [isTyping, setIsTyping] = useState(false);

  const previousTextRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const hasStartedFadeRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setOpacity(1);
      setIsTyping(false);
      return;
    }

    // 检查文本是否是增量的（流式情况）
    const previousText = previousTextRef.current;
    const isIncrementalUpdate =
      previousText && fullText.startsWith(previousText);

    // 如果是增量更新且文本长度增加，说明有新内容到达
    if (isIncrementalUpdate && fullText.length > previousText.length) {
      previousTextRef.current = fullText;

      // 如果还未开始淡入动画，现在启动
      if (!hasStartedFadeRef.current) {
        hasStartedFadeRef.current = true;
        startTimeRef.current = null;
        setOpacity(0); // 新内容从淡色开始
        setIsTyping(true);
      }
    } else if (!isIncrementalUpdate && previousText !== fullText) {
      // 文本被完全替换，重置
      previousTextRef.current = fullText;
      hasStartedFadeRef.current = false;
      startTimeRef.current = null;
      setOpacity(fullText ? 0 : 1);
      setIsTyping(!!fullText);
    }

    // 如果启用了打字效果且正在接收或者还在淡入中，启动动画
    if (enabled && (isStreaming || hasStartedFadeRef.current)) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      const animate = (timestamp: number) => {
        if (startTimeRef.current === null) {
          startTimeRef.current = timestamp;
        }

        const elapsed = timestamp - startTimeRef.current;
        const newOpacity = Math.min(1, elapsed / fadeDuration);

        setOpacity(newOpacity);

        // 如果动画未完成，继续
        if (newOpacity < 1) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          // 动画完成
          setIsTyping(false);
          hasStartedFadeRef.current = false;
          rafRef.current = null;
        }
      };

      rafRef.current = requestAnimationFrame(animate);
    } else {
      setOpacity(1);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [fullText, isStreaming, enabled, fadeDuration]);

  return {
    opacity,
    isTyping,
  };
}

/**
 * 用于处理流式文本的 Hook
 * 当接收到流式数据时，自动启用浮现效果
 */
export function useStreamingTypewriter(
  fullText: string,
  isStreaming: boolean,
  config?: TypewriterConfig,
): TypewriterState {
  const effectConfig = {
    ...config,
    enabled: isStreaming || (config?.enabled ?? true),
  };

  return useTypewriterEffect(fullText, isStreaming, effectConfig);
}
