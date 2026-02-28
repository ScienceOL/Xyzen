/*
自动切换为移动端布局的断点宽度，单位为像素
*/
export const MOBILE_BREAKPOINT = 787;

// Default timezone used for admin stats date boundaries.
export const DEFAULT_TIMEZONE = "Asia/Shanghai";

/*
Sidebar 模式编辑器宽度的最小值、最大值和默认值，单位为像素
*/
export const MIN_WIDTH = 64 * 9;
export const MAX_WIDTH = 64 * 15;
export const DEFAULT_WIDTH = 64 * 10;

/**
 * i18n key for the default topic title shown on newly created topics.
 * Backend auto-rename triggers only when the topic name matches one of the
 * translated values of this key, so every topic-creation call site MUST use
 * this constant to stay in sync.
 */
export const DEFAULT_TOPIC_TITLE_KEY = "app.chatConfig.defaultTitle";

/**
 * Default working directory inside sandbox environments.
 * Must stay in sync with the backend `XYZEN_SANDBOX_WorkDir` setting.
 */
export const SANDBOX_WORKDIR = "/workspace";
