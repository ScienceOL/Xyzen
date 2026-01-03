/**
 * FadeIn 文字浮现效果 Hook
 *
 * 使用方式：
 * const { maskStyle } = useFadeInText(content, isStreaming);
 *
 * 效果说明：
 * - 流式传输时，内容底部有渐变淡入效果
 * - 新内容从底部"浮现"出来
 * - 流式结束后，渐变效果消失
 */
import { useEffect, useRef, useState } from "react";

export interface FadeInTextConfig {
  /** 是否启用淡入效果，默认 true */
  enabled?: boolean;
  /** 渐变区域高度（像素），默认 60 */
  fadeHeight?: number;
  /** 渐变结束时的透明度（0-1），默认 0.3 */
  fadeEndOpacity?: number;
  /** 淡出过渡时长（毫秒），流式结束时遮罩消失的时间 */
  transitionDuration?: number;
}

export interface FadeInTextState {
  /** 应用于内容容器的遮罩样式 */
  maskStyle: React.CSSProperties;
  /** 是否正在流式传输 */
  isActive: boolean;
}

export function useFadeInText(
  /** 文本内容 */
  content: string,
  /** 是否正在流式接收 */
  isStreaming: boolean,
  /** 配置选项 */
  config: FadeInTextConfig = {},
): FadeInTextState {
  const {
    enabled = true,
    fadeHeight = 100,
    fadeEndOpacity = 0.2,
    transitionDuration = 500,
  } = config;

  // 追踪是否有活跃的流式传输
  const [isActive, setIsActive] = useState(false);
  // 上次的流式状态
  const wasStreamingRef = useRef(false);
  // 上次的内容长度
  const lastLengthRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setIsActive(false);
      wasStreamingRef.current = isStreaming;
      lastLengthRef.current = content.length;
      return;
    }

    const currentLength = content.length;
    const lastLength = lastLengthRef.current;

    // 检测流式开始或有新内容
    if (isStreaming && currentLength > lastLength) {
      setIsActive(true);
    }

    // 流式结束
    if (!isStreaming && wasStreamingRef.current) {
      // 延迟一小段时间后关闭，让最后的内容有时间完成淡入
      setTimeout(() => {
        setIsActive(false);
      }, transitionDuration);
    }

    wasStreamingRef.current = isStreaming;
    lastLengthRef.current = currentLength;
  }, [content, isStreaming, enabled, transitionDuration]);

  // 计算遮罩样式
  const maskStyle: React.CSSProperties = {};

  if (enabled && isActive) {
    // 创建底部渐变遮罩：从完全不透明到半透明
    // 这样新内容会从底部"浮现"出来
    const gradient = `linear-gradient(to bottom,
      rgba(0,0,0,1) 0%,
      rgba(0,0,0,1) calc(100% - ${fadeHeight}px),
      rgba(0,0,0,${fadeEndOpacity}) 100%
    )`;

    maskStyle.maskImage = gradient;
    maskStyle.WebkitMaskImage = gradient;
    maskStyle.transition = `mask-image ${transitionDuration}ms ease-out, -webkit-mask-image ${transitionDuration}ms ease-out`;
  }

  return {
    maskStyle,
    isActive,
  };
}

// 保持向后兼容的别名
export const useSmoothText = useFadeInText;
export type SmoothTextConfig = FadeInTextConfig;
export type SmoothTextState = FadeInTextState;

export default useFadeInText;
