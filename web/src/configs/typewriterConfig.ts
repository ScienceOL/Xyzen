/**
 * FadeIn 文字浮现效果配置
 *
 * 效果说明：
 * - 流式传输时，内容底部有渐变浮现效果
 * - 新内容从底部"浮现"出来
 */
export const SMOOTH_TEXT_CONFIG = {
  // 是否全局启用淡入浮现效果
  enabled: true,

  // 渐变区域高度（像素）
  // 调整到 180px 以显示约 8-9 行内容，避免过多空白
  fadeHeight: 180,

  // 渐变结束时的透明度（0-1）
  // 降低到 0.05 使渐变更柔和，浮现效果更明显
  fadeEndOpacity: 0.05,

  // 淡出过渡时长（毫秒）
  // 延长到 800ms 使浮现效果更缓慢、更明显
  transitionDuration: 800,

  // 是否对用户消息启用效果
  enableForUserMessages: false,

  // 是否对历史消息启用效果
  enableForHistoryMessages: false,
} as const;

/**
 * 淡入效果预设配置
 */
export const SMOOTH_TEXT_PRESETS = {
  // 明显浮现效果（显示 8-9 行）
  prominent: {
    fadeHeight: 180,
    fadeEndOpacity: 0.05,
    transitionDuration: 800,
  },

  // 标准浮现效果（推荐，显示 6-7 行）
  standard: {
    fadeHeight: 140,
    fadeEndOpacity: 0.1,
    transitionDuration: 600,
  },

  // 轻微浮现效果（显示 4-5 行）
  subtle: {
    fadeHeight: 100,
    fadeEndOpacity: 0.2,
    transitionDuration: 400,
  },

  // 禁用浮现效果
  none: {
    fadeHeight: 0,
    fadeEndOpacity: 1,
    transitionDuration: 0,
  },
} as const;

export type SmoothTextPresetKey = keyof typeof SMOOTH_TEXT_PRESETS;
