import { BubbleBackground } from "@/components/animate-ui/components/backgrounds/bubble";
import { Button } from "@/components/ui/button";
import { redemptionService } from "@/service/redemptionService";
import { CheckCircleIcon, TicketIcon } from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function RedemptionSettings() {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Mutation for redeeming code
  const redeemMutation = useMutation({
    mutationFn: (code: string) => redemptionService.redeemCode(code),
    onSuccess: (data) => {
      setSuccess(data.message);
      setError(null);
      setCode("");
    },
    onError: (err: Error) => {
      setError(err.message);
      setSuccess(null);
    },
  });

  const handleRedeem = () => {
    if (!code.trim()) {
      setError(t("settings.redemption.errors.empty"));
      return;
    }
    setError(null);
    setSuccess(null);
    redeemMutation.mutate(code.trim());
  };

  return (
    <div className="relative h-full min-h-125 w-full overflow-hidden rounded-xl">
      <BubbleBackground className="absolute inset-0" />

      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-md md:p-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
              <TicketIcon className="h-6 w-6 text-white" />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-white">
              {t("settings.redemption.title")}
            </h2>
            <p className="text-sm text-white/80">
              {t("settings.redemption.subtitle")}
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label
                htmlFor="redemption-code"
                className="ml-1 block text-sm font-medium text-white/90"
              >
                {t("settings.redemption.form.label")}
              </label>
              <input
                id="redemption-code"
                type="text"
                placeholder={t("settings.redemption.form.placeholder")}
                value={code}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setCode(e.target.value.toUpperCase())
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    handleRedeem();
                  }
                }}
                autoComplete="off"
                className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder-white/50 backdrop-blur-sm transition-all focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-50"
                disabled={redeemMutation.isPending}
              />
            </div>

            <Button
              onClick={handleRedeem}
              disabled={redeemMutation.isPending || !code.trim()}
              className="h-12 w-full rounded-xl bg-white text-base font-semibold text-violet-900 shadow-lg transition-all hover:bg-white/90 active:scale-95 disabled:opacity-70"
            >
              {redeemMutation.isPending
                ? t("settings.redemption.form.redeeming")
                : t("settings.redemption.form.redeem")}
            </Button>

            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-red-500/20 p-3 text-sm text-red-100 backdrop-blur-sm border border-red-500/30">
                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 rounded-xl bg-green-500/20 p-3 text-sm text-green-100 backdrop-blur-sm border border-green-500/30">
                <CheckCircleIcon className="h-5 w-5 shrink-0 text-green-400" />
                {success}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
