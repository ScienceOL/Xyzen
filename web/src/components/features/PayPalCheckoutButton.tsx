import { cn } from "@/lib/utils";
import { paymentService } from "@/service/paymentService";
import {
  FUNDING,
  PayPalButtons,
  PayPalScriptProvider,
} from "@paypal/react-paypal-js";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useCelebration } from "@/hooks/useCelebration";

// ---------- Provider (mount once around plan cards) ----------

interface PayPalProviderProps {
  clientId: string;
  children: ReactNode;
}

// Map app i18n language codes to PayPal locale codes
const PAYPAL_LOCALE_MAP: Record<string, string> = {
  en: "en_US",
  zh: "zh_CN",
  ja: "ja_JP",
};

export function PayPalProvider({ clientId, children }: PayPalProviderProps) {
  const { i18n } = useTranslation();
  const locale = PAYPAL_LOCALE_MAP[i18n.language] ?? "en_US";

  if (!clientId) return <>{children}</>;

  return (
    <PayPalScriptProvider
      options={{
        clientId,
        currency: "USD",
        intent: "capture",
        locale,
        components: "buttons",
      }}
    >
      {children}
    </PayPalScriptProvider>
  );
}

// ---------- Checkout button (per plan card) ----------

interface PayPalCheckoutButtonProps {
  label?: string;
  disabled?: boolean;
  className?: string;
  onCreateOrder: () => Promise<{ order_id: string; provider_order_id: string }>;
}

export function PayPalCheckoutButton({
  label,
  disabled,
  className,
  onCreateOrder,
}: PayPalCheckoutButtonProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const celebrate = useCelebration();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orderIdRef = useRef<string>("");

  const createOrder = useCallback(async () => {
    setError(null);
    const result = await onCreateOrder();
    orderIdRef.current = result.order_id;
    return result.provider_order_id;
  }, [onCreateOrder]);

  const onApprove = useCallback(async () => {
    if (!orderIdRef.current) return;
    await paymentService.captureOrder(orderIdRef.current);
    queryClient.invalidateQueries({ queryKey: ["subscription"] });
    queryClient.invalidateQueries({ queryKey: ["subscription-usage"] });
    setExpanded(false);
    celebrate();
  }, [queryClient, celebrate]);

  const onError = useCallback(() => {
    setError(t("subscription.payment.failed"));
  }, [t]);

  const onCancel = useCallback(() => setError(null), []);

  const sharedProps = {
    disabled,
    createOrder,
    onApprove,
    onError,
    onCancel,
  } as const;

  return (
    <div className={cn("min-w-0", className)}>
      <AnimatePresence mode="wait">
        {!expanded ? (
          <motion.button
            key="trigger"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            disabled={disabled}
            onClick={() => setExpanded(true)}
            className={cn(
              "w-full rounded-lg py-2 text-xs font-semibold transition-colors",
              "bg-indigo-500 text-white hover:bg-indigo-600 dark:hover:bg-indigo-400",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {label ?? t("subscription.subscribe")}
          </motion.button>
        ) : (
          <motion.div
            key="paypal"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-1">
              <div className="overflow-hidden rounded-[5px] [&_.paypal-buttons]:!block">
                <PayPalButtons
                  {...sharedProps}
                  fundingSource={FUNDING.PAYPAL}
                  style={{
                    layout: "vertical",
                    color: "gold",
                    shape: "rect",
                    label: "pay",
                    height: 40,
                    tagline: false,
                  }}
                />
              </div>

              {error && (
                <p className="mt-1 text-center text-xs text-red-500">{error}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
