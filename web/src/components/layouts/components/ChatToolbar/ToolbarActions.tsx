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
          <p>{isCreatingNewChat ? "创建中..." : "新对话"}</p>
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
          <p>上传文件</p>
        </TooltipContent>
      </Tooltip>
    </>
  );
}

export default ToolbarActions;
