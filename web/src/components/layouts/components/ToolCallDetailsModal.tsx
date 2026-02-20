import ToolCallDetails from "./ToolCallDetails";
import type { ToolCall } from "@/store/types";
import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { XMarkIcon } from "@heroicons/react/24/outline";
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
    <SheetModal isOpen={open} onClose={onClose} size="lg">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {toolCall.name}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {t("app.chat.toolCall.status")}: {toolCall.status}
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3">
        <ToolCallDetails
          toolCall={toolCall}
          showTimestamp={!isWaitingConfirmation}
        />
      </div>

      {/* Confirmation buttons */}
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
    </SheetModal>
  );
}
