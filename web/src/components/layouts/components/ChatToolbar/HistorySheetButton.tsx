/**
 * History Sheet Button
 *
 * Button that opens the session history sidebar/sheet.
 */

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/animate-ui/components/animate/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/animate-ui/components/radix/sheet";
import SessionHistory from "../SessionHistory";
import { ClockIcon } from "@heroicons/react/24/outline";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface HistorySheetButtonProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
  onSelectTopic: (topic: string) => void;
  buttonClassName: string;
}

export function HistorySheetButton({
  isOpen,
  onOpenChange,
  onClose,
  onSelectTopic,
  buttonClassName,
}: HistorySheetButtonProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <button className={buttonClassName}>
              <ClockIcon className="h-5 w-5" />
            </button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>历史记录</p>
        </TooltipContent>
      </Tooltip>
      <SheetContent
        showCloseButton={false}
        side="right"
        className="w-11/12 max-w-md p-0 h-full"
      >
        <VisuallyHidden>
          <SheetTitle>会话历史</SheetTitle>
          <SheetDescription>当前会话的对话主题</SheetDescription>
        </VisuallyHidden>
        <SessionHistory
          isOpen={isOpen}
          onClose={onClose}
          onSelectTopic={onSelectTopic}
        />
      </SheetContent>
    </Sheet>
  );
}

export default HistorySheetButton;
