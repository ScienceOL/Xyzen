import ToolCallDetails from "./ToolCallDetails";
import type { ToolCall } from "@/store/types";
import { zIndexClasses } from "@/constants/zIndex";
import { Dialog, DialogPanel } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";

interface ToolCallDetailsModalProps {
  toolCall: ToolCall;
  open: boolean;
  onClose: () => void;
  onConfirm?: (toolCallId: string) => void;
  onCancel?: (toolCallId: string) => void;
}

export default function ToolCallDetailsModal({
  toolCall,
  open,
  onClose,
  onConfirm,
  onCancel,
}: ToolCallDetailsModalProps) {
  const { t } = useTranslation();
  const isWaitingConfirmation = toolCall.status === "waiting_confirmation";

  return (
    <AnimatePresence>
      {open && (
        <Dialog
          static
          open={open}
          onClose={onClose}
          className={zIndexClasses.modal}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
          />

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 6 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <DialogPanel className="w-full max-w-2xl rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
                  <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {toolCall.name}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        Status: {toolCall.status}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                      title={t("common.close", { defaultValue: "Close" })}
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="px-4 py-3">
                    <ToolCallDetails
                      toolCall={toolCall}
                      showTimestamp={!isWaitingConfirmation}
                    />
                  </div>

                  {isWaitingConfirmation && (
                    <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
                      <button
                        type="button"
                        onClick={() => onCancel?.(toolCall.id)}
                        className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
                      >
                        {t("common.cancel", { defaultValue: "Cancel" })}
                      </button>
                      <button
                        type="button"
                        onClick={() => onConfirm?.(toolCall.id)}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                      >
                        {t("app.chat.toolCall.confirmExecute", {
                          defaultValue: "Confirm",
                        })}
                      </button>
                    </div>
                  )}
                </DialogPanel>
              </motion.div>
            </div>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
