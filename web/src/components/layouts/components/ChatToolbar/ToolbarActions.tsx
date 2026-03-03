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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  ArrowPathIcon,
  DocumentTextIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

interface ToolbarActionsProps {
  onNewChat: () => void;
  onCompactChat?: () => void;
  isCreatingNewChat: boolean;
  hasActiveChat: boolean;
  isUploading: boolean;
  buttonClassName: string;
}

export function ToolbarActions({
  onNewChat,
  onCompactChat,
  isCreatingNewChat,
  hasActiveChat,
  isUploading,
  buttonClassName,
}: ToolbarActionsProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* New Chat Button — dropdown with plain / compact options */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
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
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {isCreatingNewChat
                ? t("app.toolbar.newChatCreating")
                : t("app.toolbar.newChat")}
            </p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" sideOffset={8}>
          <DropdownMenuItem onSelect={onNewChat}>
            <PlusIcon className="h-4 w-4" />
            {t("app.toolbar.newChat")}
          </DropdownMenuItem>
          {hasActiveChat && onCompactChat && (
            <DropdownMenuItem onSelect={onCompactChat}>
              <DocumentTextIcon className="h-4 w-4" />
              {t("app.toolbar.newChatWithSummary")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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
