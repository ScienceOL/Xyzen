import { useCelebration } from "@/hooks/useCelebration";
import { paymentService } from "@/service/paymentService";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

interface CheckoutData {
  orderId: string;
  intentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
  planName: string;
  env: string;
}

type PageStatus = "idle" | "loading" | "pending" | "succeeded" | "failed";

const STORAGE_KEY = "checkout_data";

function readCheckoutData(): CheckoutData | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CheckoutData;
  } catch {
    return null;
  }
}

function clearCheckoutData() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function CheckoutPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const celebrate = useCelebration();

  const [data] = useState<CheckoutData | null>(readCheckoutData);
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<PageStatus>("idle");

  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<Awaited<
    ReturnType<typeof import("@airwallex/components-sdk").createElement>
  > | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Shared success handler — called by either SDK event or backend polling
  const handleSuccess = useCallback(() => {
    setStatus((prev) => {
      if (prev === "succeeded") return prev; // already handled
      return "succeeded";
    });
    stopPolling();
    queryClient.invalidateQueries({ queryKey: ["subscription"] });
    queryClient.invalidateQueries({ queryKey: ["subscription-usage"] });
    celebrate();
  }, [stopPolling, queryClient, celebrate]);

  const goBack = useCallback(() => {
    stopPolling();
    clearCheckoutData();
    if (elementRef.current) {
      try {
        elementRef.current.destroy();
      } catch {
        // ignore
      }
      elementRef.current = null;
    }
    window.location.hash = "";
  }, [stopPolling]);

  const formattedPrice = useMemo(() => {
    if (!data) return "";
    return data.currency === "CNY"
      ? `¥${(data.amount / 100).toFixed(2)}`
      : `$${(data.amount / 100).toFixed(2)}`;
  }, [data]);

  // Mount Drop-in element when user agrees to ToS
  useEffect(() => {
    if (!agreed || !data) return;

    let cancelled = false;

    const mount = async () => {
      setStatus("loading");
      try {
        const { init, createElement } =
          await import("@airwallex/components-sdk");

        if (cancelled) return;

        await init({
          env: data.env as "demo" | "prod",
          enabledElements: ["payments"],
        });

        if (cancelled) return;

        const element = await createElement("dropIn", {
          intent_id: data.intentId,
          client_secret: data.clientSecret,
          currency: data.currency,
          autoCapture: true,
          withBilling: true,
        });

        if (cancelled || !element) return;

        elementRef.current = element;

        element.on("ready", () => {
          if (!cancelled) setStatus("pending");
        });

        element.on("success", () => {
          if (!cancelled) handleSuccess();
        });

        element.on("error", () => {
          if (!cancelled) setStatus("failed");
        });

        // Mount first, then attach listeners — some SDK builds fire
        // "ready" synchronously during mount, before .on() is called.
        if (containerRef.current) {
          const container = containerRef.current;
          container.innerHTML = "";
          element.mount(container);
        }

        // Fallback: if "ready" never fires, clear the spinner after 5s
        setTimeout(() => {
          if (!cancelled) setStatus((s) => (s === "loading" ? "pending" : s));
        }, 5000);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to mount Airwallex Drop-in:", err);
          setStatus("failed");
        }
      }
    };

    void mount();

    return () => {
      cancelled = true;
      if (elementRef.current) {
        try {
          elementRef.current.destroy();
        } catch {
          // ignore
        }
        elementRef.current = null;
      }
    };
  }, [agreed, data, handleSuccess]);

  // Poll backend for order fulfillment as soon as the Drop-in is mounted.
  // This catches payments (WeChat, Alipay, etc.) where the SDK "success"
  // event may not fire — the backend learns about them via Airwallex webhook.
  useEffect(() => {
    if ((status !== "pending" && status !== "loading") || !data?.orderId)
      return;

    const poll = async () => {
      try {
        const res = await paymentService.getOrderStatus(data.orderId);
        if (res.fulfilled) {
          handleSuccess();
        }
      } catch {
        // silently retry
      }
    };

    // Start polling 5s after mount to give the webhook time to arrive,
    // then check every 3s.
    const startDelay = setTimeout(() => {
      void poll();
      timerRef.current = setInterval(poll, 3000);
    }, 5000);

    return () => {
      clearTimeout(startDelay);
      stopPolling();
    };
  }, [status, data?.orderId, stopPolling, handleSuccess]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      if (elementRef.current) {
        try {
          elementRef.current.destroy();
        } catch {
          // ignore
        }
        elementRef.current = null;
      }
    };
  }, [stopPolling]);

  // No checkout data — redirect back
  if (!data) {
    window.location.hash = "";
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-2xl px-6 py-12">
        {/* Back button */}
        <button
          onClick={goBack}
          className="mb-8 inline-flex items-center gap-1.5 text-[13px] text-neutral-500 transition-colors hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("subscription.payment.backToPlans")}
        </button>

        {/* Success state */}
        {status === "succeeded" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 py-16"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircleIcon className="h-10 w-10 text-green-500" />
            </div>
            <div className="text-lg font-semibold text-green-600 dark:text-green-400">
              {t("subscription.payment.success")}
            </div>
            <button
              onClick={goBack}
              className="mt-4 rounded-lg bg-green-500 px-6 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-green-600"
            >
              {t("subscription.gotIt")}
            </button>
          </motion.div>
        )}

        {/* Failed state */}
        {status === "failed" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 py-16"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <XCircleIcon className="h-10 w-10 text-red-500" />
            </div>
            <div className="text-lg font-semibold text-red-600 dark:text-red-400">
              {t("subscription.payment.failed")}
            </div>
            <button
              onClick={goBack}
              className="mt-4 rounded-lg bg-neutral-100/80 px-6 py-2 text-[13px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
            >
              {t("subscription.payment.backToPlans")}
            </button>
          </motion.div>
        )}

        {/* Normal flow: order summary + agreement + drop-in */}
        {status !== "succeeded" && status !== "failed" && (
          <div className="space-y-6">
            {/* Order Summary */}
            <div className="rounded-lg bg-neutral-100/60 p-5 dark:bg-white/[0.04]">
              <h2 className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
                {t("subscription.payment.orderSummary")}
              </h2>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-[13px] text-neutral-700 dark:text-neutral-300">
                  {data.planName}
                </span>
                <span className="text-lg font-semibold text-neutral-900 dark:text-white">
                  {formattedPrice}
                </span>
              </div>
            </div>

            {/* Terms agreement */}
            <label className="flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.02]">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-indigo-500 focus:ring-indigo-500 dark:border-neutral-600 dark:bg-neutral-800"
              />
              <span className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-400">
                <Trans
                  i18nKey="subscription.payment.agreeTerms"
                  components={{
                    terms: (
                      <a
                        href="#/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-500 hover:underline"
                      />
                    ),
                    refund: (
                      <a
                        href="#/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-500 hover:underline"
                      />
                    ),
                  }}
                />
              </span>
            </label>

            {/* Drop-in container — only render after agreement.
                Airwallex SDK renders white-only UI, so we wrap it in a
                light card that looks intentional in both light & dark mode. */}
            {agreed ? (
              <div className="relative min-h-[200px] w-full rounded-lg bg-white p-4 shadow-sm dark:shadow-none">
                {status === "loading" && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-500" />
                  </div>
                )}
                <div ref={containerRef} className="w-full" />
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-lg bg-neutral-50/80 py-10 dark:bg-white/[0.02]">
                <p className="text-[13px] text-neutral-400 dark:text-neutral-500">
                  {t("subscription.payment.agreeRequired")}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
