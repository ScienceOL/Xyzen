"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

/**
 * Props for the confirmation dialog.
 */
interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * If true, styles the confirm action as destructive (red).
   */
  destructive?: boolean;
  /**
   * Optional className to extend the content panel styling.
   */
  className?: string;
}

/**
 * A unified confirmation modal using shadcn/Radix AlertDialog primitives.
 * Replaces the former Headless UI + custom Modal implementation to avoid nested focus traps.
 */
function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  className,
}: ConfirmationModalProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent
        className={cn(
          // Base panel styling adapted from previous modal
          "space-y-4 border border-neutral-200/20 bg-white/95 shadow-2xl shadow-black/20 backdrop-blur-xl dark:border-neutral-700/30 dark:bg-neutral-900/95 dark:shadow-black/40",
          "p-6 sm:p-6 rounded-sm",
          className,
        )}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            {title}
          </AlertDialogTitle>
        </AlertDialogHeader>

        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <ExclamationTriangleIcon
              className="h-6 w-6 text-red-600 dark:text-red-400"
              aria-hidden="true"
            />
          </div>
          <AlertDialogDescription className="text-sm text-neutral-600 dark:text-neutral-400">
            {message}
          </AlertDialogDescription>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel
            className={cn(
              "inline-flex items-center gap-2",
              "font-semibold",
              "dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700",
            )}
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            autoFocus
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={cn(
              "inline-flex items-center gap-2 font-semibold",
              destructive
                ? "bg-red-600 text-white shadow-inner shadow-white/10 hover:bg-red-500 dark:bg-red-500 dark:hover:bg-red-400"
                : "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200",
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default React.memo(ConfirmationModal);
