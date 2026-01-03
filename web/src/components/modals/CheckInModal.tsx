import { BubbleBackground } from "@/components/animate-ui/components/backgrounds/bubble";
import { ModalTitleLess } from "@/components/animate-ui/primitives/headless/modal-title-less";
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
    <ModalTitleLess isOpen={isOpen} onClose={onClose} maxWidth="max-w-5xl">
      <div className="relative h-180 max-h-[90vh] w-full overflow-hidden rounded-xl bg-white/50 flex flex-col dark:bg-black/50">
        <BubbleBackground
          className="absolute inset-0 opacity-30 dark:opacity-20"
          colors={{
            first: "99,102,241", // indigo-500
            second: "168,85,247", // purple-500
            third: "236,72,153", // pink-500
            fourth: "59,130,246", // blue-500
            fifth: "139,92,246", // violet-500
            sixth: "217,70,239", // fuchsia-500
          }}
        />
        <div className="relative z-10 h-full w-full overflow-y-auto p-3 sm:p-6">
          <CheckInCalendar onCheckInSuccess={onCheckInSuccess} />
        </div>
      </div>
    </ModalTitleLess>
  );
}
