"use client";

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@/components/animate-ui/primitives/headless/dialog";
import { zIndexClasses } from "@/constants/zIndex";
import { type ReactNode, useCallback, useEffect } from "react";
import {
  motion,
  useDragControls,
  useMotionValue,
  animate,
  type PanInfo,
} from "framer-motion";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: string;
  minWidth?: string;
  maxHeight?: string;
  minHeight?: string;
  panelClassName?: string;
  containerClassName?: string;
  swipeToDismiss?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "max-w-2xl",
  minWidth = "",
  maxHeight = "",
  minHeight = "",
  panelClassName,
  containerClassName,
  swipeToDismiss,
}: ModalProps) {
  const dragControls = useDragControls();
  const y = useMotionValue(0);

  useEffect(() => {
    if (isOpen) y.set(0);
  }, [isOpen, y]);

  const handleDragEnd = useCallback(
    async (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.y > 150 || info.velocity.y > 500) {
        await animate(y, window.innerHeight, {
          duration: 0.25,
          ease: "easeIn",
        });
        onClose();
      } else {
        animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
      }
    },
    [onClose, y],
  );

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className={`relative ${zIndexClasses.modal}`}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm" />

      <motion.div
        className={
          containerClassName ??
          "fixed inset-0 flex w-screen items-center justify-center p-4"
        }
        style={swipeToDismiss ? { y } : undefined}
        drag={swipeToDismiss ? "y" : false}
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.3 }}
        dragMomentum={false}
        onDragEnd={swipeToDismiss ? handleDragEnd : undefined}
      >
        <DialogPanel
          from="top"
          className={
            panelClassName ??
            `flex w-full flex-col ${maxWidth} ${minWidth} ${minHeight} ${maxHeight} space-y-4 rounded-sm border border-neutral-200/20 bg-white/95 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl dark:border-neutral-700/30 dark:bg-neutral-900/95 dark:shadow-black/40`
          }
        >
          {swipeToDismiss && (
            <div
              className="flex shrink-0 cursor-grab justify-center pb-1 pt-2 active:cursor-grabbing md:hidden"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: "none" }}
            >
              <div className="h-1 w-9 rounded-full bg-neutral-300 dark:bg-neutral-600" />
            </div>
          )}
          {title && title.trim() !== "" ? (
            <DialogTitle className="text-lg font-bold text-neutral-900 dark:text-neutral-100 shrink-0">
              {title}
            </DialogTitle>
          ) : null}
          <div className="flex-1 overflow-visible min-h-0">{children}</div>
        </DialogPanel>
      </motion.div>
    </Dialog>
  );
}
