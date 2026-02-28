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
  planKey: string;
  disabled?: boolean;
}

export function PayPalCheckoutButton({
  planKey,
  disabled,
}: PayPalCheckoutButtonProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orderIdRef = useRef<string>("");

  const createOrder = useCallback(async () => {
    setError(null);
    const result = await paymentService.createCheckout(planKey, "paypal");
    orderIdRef.current = result.order_id;
    return result.provider_order_id;
  }, [planKey]);

  const onApprove = useCallback(async () => {
    if (!orderIdRef.current) return;
    await paymentService.captureOrder(orderIdRef.current);
    queryClient.invalidateQueries({ queryKey: ["subscription"] });
    setExpanded(false);
  }, [queryClient]);

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
    <div className="mt-auto w-full">
      <button
        disabled={disabled}
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "w-full rounded-lg py-2 text-xs font-semibold transition-colors",
          "bg-indigo-500 text-white hover:bg-indigo-600 dark:hover:bg-indigo-400",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        {t("subscription.subscribe")}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pt-2">
              {/* PayPal — popup supports card payments too */}
              <div className="overflow-hidden rounded-[5px] [&_.paypal-buttons]:!block">
                <PayPalButtons
                  {...sharedProps}
                  fundingSource={FUNDING.PAYPAL}
                  style={{
                    layout: "horizontal",
                    color: "gold",
                    shape: "rect",
                    label: "pay",
                    height: 40,
                    tagline: false,
                  }}
                />
              </div>

              {error && (
                <p className="text-center text-xs text-red-500">{error}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
