"use client";

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
} from "@/components/animate-ui/primitives/headless/dialog";
import { zIndexClasses } from "@/constants/zIndex";
import type { ReactNode } from "react";

interface ModalTitleLessProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  minWidth?: string;
  maxHeight?: string;
  minHeight?: string;
}

export function ModalTitleLess({
  isOpen,
  onClose,
  children,
  maxWidth = "max-w-2xl",
  minWidth = "",
  maxHeight = "",
  minHeight = "",
}: ModalTitleLessProps) {
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className={`relative ${zIndexClasses.modal}`}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm" />

      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel
          from="top"
          className={`w-full ${maxWidth} ${minWidth} ${minHeight} ${maxHeight} overflow-hidden rounded-sm border border-neutral-200/20 bg-white/95 shadow-2xl shadow-black/20 backdrop-blur-xl dark:border-neutral-700/30 dark:bg-neutral-900/95 dark:shadow-black/40`}
        >
          {children}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
