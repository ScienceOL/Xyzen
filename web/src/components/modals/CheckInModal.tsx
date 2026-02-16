import { BubbleBackground } from "@/components/animate-ui/components/backgrounds/bubble";
import { Modal } from "@/components/animate-ui/components/animate/modal";
import { CheckInCalendar } from "@/components/features/CheckInCalendar";
import type { CheckInResponse } from "@/service/checkinService";

export interface CheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckInSuccess?: (response: CheckInResponse) => void;
}

export function CheckInModal({
  isOpen,
  onClose,
  onCheckInSuccess,
}: CheckInModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      containerClassName="fixed inset-0 flex w-screen items-end justify-center md:items-center md:p-4"
      panelClassName="flex w-full flex-col h-[95dvh] rounded-t-2xl border-t border-neutral-200/30 bg-white/95 shadow-2xl shadow-black/20 backdrop-blur-xl dark:border-neutral-700/30 dark:bg-neutral-900/95 dark:shadow-black/40 md:h-auto md:max-h-[85vh] md:max-w-5xl md:rounded-2xl md:border md:border-neutral-200/20"
      swipeToDismiss
    >
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
          <CheckInCalendar onCheckInSuccess={onCheckInSuccess} />
        </div>
      </div>
    </Modal>
  );
}
