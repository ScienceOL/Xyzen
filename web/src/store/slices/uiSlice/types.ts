export const LAYOUT_STYLE = {
  Sidebar: "sidebar",
  Fullscreen: "fullscreen",
} as const;

export type LayoutStyle = (typeof LAYOUT_STYLE)[keyof typeof LAYOUT_STYLE];

// 可选：用于遍历/校验
export const LAYOUT_STYLES = Object.values(
  LAYOUT_STYLE,
) as readonly LayoutStyle[];

export type InputPosition =
  | "top"
  | "bottom"
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";
