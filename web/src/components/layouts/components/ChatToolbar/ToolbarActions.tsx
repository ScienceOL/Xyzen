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
      {/* New Chat Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onNewChat}
            disabled={isCreatingNewChat}
            className={buttonClassName}
          >
            {isCreatingNewChat ? (
              <ArrowPathIcon className="h-5 w-5 animate-spin" />
            ) : (
              <PlusIcon className="h-5 w-5" />
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
