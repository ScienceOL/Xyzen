"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface InputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
  title: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  className?: string;
}

export function InputModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  initialValue = "",
  placeholder = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  className,
}: InputModalProps) {
  const [value, setValue] = useState(initialValue);

  // Reset value when modal opens
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
    }
  }, [isOpen, initialValue]);

  const handleConfirm = () => {
    if (value.trim()) {
      onConfirm(value.trim());
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          "space-y-4 border border-neutral-200/20 bg-white/95 shadow-2xl shadow-black/20 backdrop-blur-xl dark:border-neutral-700/30 dark:bg-neutral-900/95 dark:shadow-black/40",
          "p-6 sm:p-6 rounded-sm w-full max-w-md",
          className,
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            {title}
          </DialogTitle>
          {message && (
            <DialogDescription className="text-sm text-neutral-600 dark:text-neutral-400">
              {message}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="py-2">
          <input
            type="text"
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default React.memo(InputModal);
