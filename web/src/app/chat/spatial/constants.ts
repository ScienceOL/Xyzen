// LocalStorage keys for persistence
export const STORAGE_KEY_FOCUSED_AGENT = "xyzen_spatial_focused_agent";
export const STORAGE_KEY_VIEWPORT = "xyzen_spatial_viewport";

// Constants for node sizing
export const NODE_SIZES = {
  small: { w: 200, h: 160 },
  medium: { w: 300, h: 220 },
  large: { w: 400, h: 320 },
} as const;

export const OVERLAP_PADDING = 24;
export const MAX_OVERLAP_ITERATIONS = 50;

// Default viewport configuration
export const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 0.85 };
export const FOCUS_ZOOM = 1.05;
