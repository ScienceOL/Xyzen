import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { BubbleBackground } from "@/components/animate-ui/components/backgrounds/bubble";
import { ConsumptionAnalytics } from "@/components/features/ConsumptionAnalytics";

export interface ConsumptionAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConsumptionAnalyticsModal({
  isOpen,
  onClose,
}: ConsumptionAnalyticsModalProps) {
  return (
    <SheetModal isOpen={isOpen} onClose={onClose} size="full">
      <div className="relative flex h-full flex-col overflow-hidden">
        <BubbleBackground
          className="pointer-events-none absolute inset-0 opacity-30 dark:opacity-20"
          colors={{
            first: "99,102,241",
            second: "168,85,247",
            third: "236,72,153",
            fourth: "59,130,246",
            fifth: "139,92,246",
            sixth: "217,70,239",
          }}
        />
        <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6">
          <ConsumptionAnalytics onClose={onClose} />
        </div>
      </div>
    </SheetModal>
  );
}
