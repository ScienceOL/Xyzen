"use client";

import { Modal } from "./modal";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Mobile-first bottom sheet / desktop centered modal.
 *
 * Wraps `<Modal>` with the standard Xyzen sheet chrome:
 *  - Mobile: full-width bottom sheet (`h-[95dvh]`, rounded top, swipe-to-dismiss)
 *  - Desktop: centered dialog with rounded corners and border
 *
 * Use the `size` prop to choose a desktop width preset, or pass a custom
 * `desktopClassName` for full control over the `md:` breakpoint styles.
 */

export type SheetModalSize = "sm" | "md" | "lg" | "xl" | "full";

const DESKTOP_SIZE: Record<SheetModalSize, string> = {
  sm: "md:h-auto md:max-h-[80vh] md:max-w-lg",
  md: "md:h-auto md:max-h-[85vh] md:max-w-2xl",
  lg: "md:h-auto md:max-h-[85vh] md:max-w-5xl",
  xl: "md:h-[85vh] md:max-w-[90vw] md:min-h-[600px]",
  full: "md:h-[90vh] md:max-w-[95vw]",
};

interface SheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Desktop size preset (default: "lg") */
  size?: SheetModalSize;
  /** Override the mobile height (default: "h-[95dvh]") */
  mobileHeight?: string;
  /** Extra classes merged into panelClassName */
  className?: string;
  /** Fully override the desktop portion of panelClassName */
  desktopClassName?: string;
}

const CONTAINER =
  "fixed inset-0 flex w-screen items-end justify-center md:items-center md:p-4";

const BASE_PANEL =
  "relative overflow-hidden flex w-full flex-col rounded-t-2xl border-t border-neutral-200/30 bg-white/95 shadow-2xl shadow-black/20 backdrop-blur-xl dark:border-neutral-700/30 dark:bg-neutral-900/95 dark:shadow-black/40 md:rounded-2xl md:border md:border-neutral-200/20 [&>div:last-child]:overflow-hidden [&>div:last-child]:flex [&>div:last-child]:flex-col [&>div:last-child]:min-h-0";

export function SheetModal({
  isOpen,
  onClose,
  children,
  size = "lg",
  mobileHeight = "h-[95dvh]",
  className,
  desktopClassName,
}: SheetModalProps) {
  const desktop = desktopClassName ?? DESKTOP_SIZE[size];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      containerClassName={CONTAINER}
      panelClassName={cn(BASE_PANEL, mobileHeight, desktop, className)}
      swipeToDismiss
    >
      {children}
    </Modal>
  );
}
