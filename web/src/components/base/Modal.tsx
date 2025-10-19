"use client";

import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "max-w-2xl",
}: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog
          static
          open={isOpen}
          onClose={onClose}
          className="relative z-[10000]"
        >
          {/* Enhanced backdrop with multiple layers */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="fixed inset-0"
            aria-hidden="true"
          >
            {/* Primary backdrop with gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-black/30 to-black/50" />

            {/* Secondary overlay for depth */}
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-900/20 via-transparent to-neutral-800/10" />

            {/* Subtle animated patterns */}
            <div className="absolute inset-0 opacity-30">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-white/2 to-transparent" />
            </div>
          </motion.div>

          <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{
                duration: 0.3,
                ease: [0.4, 0, 0.2, 1],
                opacity: { duration: 0.25 },
              }}
            >
              <DialogPanel
                className={`w-full ${maxWidth} min-w-xl space-y-4 rounded-2xl border border-neutral-200/20 bg-white/95 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl dark:border-neutral-700/30 dark:bg-neutral-900/95 dark:shadow-black/40`}
              >
                <DialogTitle className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                  {title}
                </DialogTitle>
                {children}
              </DialogPanel>
            </motion.div>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
