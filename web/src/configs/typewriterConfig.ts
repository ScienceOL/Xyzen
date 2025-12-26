/**
 * Typewriter 浮现效果配置
 * 用于控制对话输出内容的渐变浮现动画（参照 lobe-chat）
 */

export const TYPEWRITER_CONFIG = {
  // 是否全局启用浮现效果
  enabled: true,

  // 渐变动画时长（毫秒）
  // 文本从淡色（低透明度）变为深色（完全不透明）的时间
  // 值越小，浮现越快；值越大，浮现越缓慢
  fadeDuration: 300,

  // 是否对用户消息启用打字效果
  enableForUserMessages: false,

  // 是否对历史消息启用打字效果
  enableForHistoryMessages: false,

  // 流式消息的特殊配置
  streaming: {
    fadeDuration: 300,
  },
} as const;

/**
 * 预设的浮现效果配置
 * 可根据用户偏好选择
 */
export const TYPEWRITER_PRESETS = {
  // 快速浮现（推荐用于快速响应）
  fast: {
    fadeDuration: 150,
  },

  // 标准浮现（平衡效果和流畅度）
  standard: {
    fadeDuration: 300,
  },

  // 缓慢浮现（推荐用于强调内容）
  slow: {
    fadeDuration: 500,
  },

  // 极端快速（几乎看不到浮现效果）
  instant: {
    fadeDuration: 50,
  },
} as const;

export type TypewriterPresetKey = keyof typeof TYPEWRITER_PRESETS;
