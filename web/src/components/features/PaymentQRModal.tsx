import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { cn } from "@/lib/utils";
import { paymentService } from "@/service/paymentService";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface PaymentQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  qrCodeUrl: string;
  amount: number;
  currency: string;
  planName: string;
  onSuccess?: () => void;
}

type PaymentStatus = "pending" | "succeeded" | "failed";

export function PaymentQRModal({
  isOpen,
  onClose,
  orderId,
  qrCodeUrl,
  amount,
  currency,
  planName,
  onSuccess,
}: PaymentQRModalProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PaymentStatus>("pending");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Poll order status every 3 seconds
  useEffect(() => {
    if (!isOpen || !orderId || status !== "pending") return;

    const poll = async () => {
      try {
        const res = await paymentService.getOrderStatus(orderId);
        if (res.status === "succeeded") {
          setStatus("succeeded");
          stopPolling();
          onSuccess?.();
        } else if (res.status === "failed" || res.status === "expired") {
          setStatus("failed");
          stopPolling();
        }
      } catch {
        // Silently retry on network errors
      }
    };

    // Start polling
    timerRef.current = setInterval(poll, 3000);

    return () => {
      stopPolling();
    };
  }, [isOpen, orderId, status, stopPolling, onSuccess]);

  // Reset state when modal opens with new order
  useEffect(() => {
    if (isOpen && orderId) {
      setStatus("pending");
    }
  }, [isOpen, orderId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const formattedAmount =
    currency === "CNY"
      ? `¥${(amount / 100).toFixed(2)}`
      : `$${(amount / 100).toFixed(2)}`;

  const handleClose = () => {
    stopPolling();
    onClose();
  };

  return (
    <SheetModal isOpen={isOpen} onClose={handleClose} size="sm">
      {/* Header */}
      <div className="shrink-0 border-b border-neutral-200/60 px-5 pb-3 pt-5 dark:border-neutral-800/60">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          {t("subscription.payment.title")}
        </h2>
      </div>

      {/* Content */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <div className="flex flex-col items-center space-y-5 px-5 py-6">
          {status === "pending" && (
            <>
              {/* QR Code (only for QR flow) */}
              {qrCodeUrl ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-lg bg-white p-4"
                >
                  <QRCodeSVG value={qrCodeUrl} size={200} level="M" />
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex h-[200px] w-[200px] items-center justify-center"
                >
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-500" />
                </motion.div>
              )}

              {/* Amount + plan info */}
              <div className="text-center">
                <div className="text-2xl font-bold text-neutral-900 dark:text-white">
                  {formattedAmount}
                </div>
                <div className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">
                  {planName}
                </div>
              </div>

              {/* Waiting indicator */}
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="flex items-center gap-2 text-[13px] text-neutral-500 dark:text-neutral-400"
              >
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                {t("subscription.payment.waiting")}
              </motion.div>
            </>
          )}

          {status === "succeeded" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 py-8"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircleIcon className="h-10 w-10 text-green-500" />
              </div>
              <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                {t("subscription.payment.success")}
              </div>
            </motion.div>
          )}

          {status === "failed" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 py-8"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <XCircleIcon className="h-10 w-10 text-red-500" />
              </div>
              <div className="text-lg font-semibold text-red-600 dark:text-red-400">
                {t("subscription.payment.failed")}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-neutral-200/60 px-5 py-4 dark:border-neutral-800/60">
        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={handleClose}
            className={cn(
              "rounded-lg px-5 py-2 text-[13px] font-semibold transition-colors",
              status === "succeeded"
                ? "bg-green-500 text-white hover:bg-green-600"
                : "bg-neutral-100/80 text-neutral-700 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]",
            )}
          >
            {status === "succeeded"
              ? t("subscription.gotIt")
              : t("subscription.payment.close")}
          </button>
        </div>
      </div>
    </SheetModal>
  );
}
