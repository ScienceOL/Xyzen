/**
 * Toolbar Action Buttons
 *
 * Contains the primary action buttons: New Chat and File Upload
 */

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/animate-ui/components/animate/tooltip";
import { FileUploadButton } from "@/components/features";
import { cn } from "@/lib/utils";
import { ArrowPathIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

interface ToolbarActionsProps {
  onNewChat: () => void;
  isCreatingNewChat: boolean;
  isUploading: boolean;
  buttonClassName: string;
}

export function ToolbarActions({
  onNewChat,
  isCreatingNewChat,
  isUploading,
  buttonClassName,
}: ToolbarActionsProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* New Chat Button — distinctive dashed circle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onNewChat}
            disabled={isCreatingNewChat}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200",
              "border border-dashed border-neutral-300 dark:border-neutral-600",
              "text-neutral-500 dark:text-neutral-400",
              "hover:border-orange-400 hover:bg-orange-50 hover:text-orange-600",
              "dark:hover:border-orange-500 dark:hover:bg-orange-950/40 dark:hover:text-orange-400",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {isCreatingNewChat ? (
              <ArrowPathIcon className="h-4.5 w-4.5 animate-spin" />
            ) : (
              <PlusIcon className="h-4.5 w-4.5" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {isCreatingNewChat
              ? t("app.toolbar.newChatCreating")
              : t("app.toolbar.newChat")}
          </p>
        </TooltipContent>
      </Tooltip>

      {/* File Upload Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex">
            <FileUploadButton
              disabled={isUploading}
              className={buttonClassName}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t("app.toolbar.uploadFile")}</p>
        </TooltipContent>
      </Tooltip>
    </>
  );
}

export default ToolbarActions;
