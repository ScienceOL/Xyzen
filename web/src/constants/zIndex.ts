/**
 * Centralized z-index management system
 *
 * This file defines a layered z-index system to prevent z-index conflicts
 * and make stacking order predictable and maintainable.
 *
 * Usage:
 * - Import the zIndex object and use named layers
 * - Add new layers here when needed
 * - Never use arbitrary z-index values in components
 */

export const zIndex = {
  // Base layers (0-99)
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,

  // Overlay layers (100-999)
  overlay: 100,
  drawer: 200,

  // Modal layers (1000-9999)
  modal: 1000,
  modalBackdrop: 1000,
  modalContent: 1001,

  // Popover/Select layers (10000-19999)
  // These should appear above modals when used inside them
  popover: 10000,
  select: 10000,
  tooltip: 10001,

  // Toast/Notification layers (20000-29999)
  toast: 20000,
  notification: 20000,

  // Maximum (30000+)
  max: 30000,
} as const;

/**
 * Tailwind class mappings for z-index values
 * Use these in className props
 */
export const zIndexClasses = {
  base: "z-0",
  dropdown: "z-10",
  sticky: "z-20",
  fixed: "z-30",
  overlay: "z-[100]",
  drawer: "z-[200]",
  modal: "z-[1000]",
  modalBackdrop: "z-[1000]",
  modalContent: "z-[1001]",
  popover: "z-[10000]",
  select: "z-[10000]",
  tooltip: "z-[10001]",
  toast: "z-[20000]",
  notification: "z-[20000]",
  max: "z-[30000]",
} as const;

export type ZIndexLayer = keyof typeof zIndex;
