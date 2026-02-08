import { motion } from "framer-motion";
import {
  Check,
  CreditCard,
  Globe,
  MessageSquare,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface FeatureItem {
  icon: React.ReactNode;
  label: string;
  synced: boolean;
  note?: string;
}

interface RegionCardProps {
  title: string;
  subtitle: string;
  isActive: boolean;
  isDisabled?: boolean;
  features: FeatureItem[];
  paymentMethods: string[];
  gradient: string;
  borderColor: string;
  iconBg: string;
}

function RegionCard({
  title,
  subtitle,
  isActive,
  isDisabled,
  features,
  paymentMethods,
  gradient,
  borderColor,
  iconBg,
}: RegionCardProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`relative flex flex-col rounded-2xl border-2 p-6 transition-all duration-300 ${
        isDisabled
          ? "cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60 dark:border-neutral-800 dark:bg-neutral-900/50"
          : `${borderColor} bg-white shadow-lg hover:shadow-xl dark:bg-neutral-900`
      } ${isActive ? "ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-neutral-950" : ""}`}
    >
      {/* Active Badge */}
      {isActive && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500 px-3 py-1 text-xs font-semibold text-white shadow-lg">
            <Check className="h-3 w-3" />
            {t("settings.region.currentRegion")}
          </span>
        </div>
      )}

      {/* Disabled Badge */}
      {isDisabled && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-400 px-3 py-1 text-xs font-semibold text-white shadow-lg dark:bg-neutral-600">
            {t("settings.region.comingSoon")}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 text-center">
        <div
          className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${iconBg}`}
        >
          <Globe
            className={`h-8 w-8 ${isDisabled ? "text-neutral-400" : "text-white"}`}
          />
        </div>
        <h3
          className={`text-xl font-bold ${isDisabled ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-900 dark:text-white"}`}
        >
          {title}
        </h3>
        <p
          className={`mt-1 text-sm ${isDisabled ? "text-neutral-400 dark:text-neutral-600" : "text-neutral-500 dark:text-neutral-400"}`}
        >
          {subtitle}
        </p>
      </div>

      {/* Features List */}
      <div className="flex-1 space-y-3">
        {features.map((feature, index) => (
          <div
            key={index}
            className={`flex items-center gap-3 rounded-lg p-2 ${
              isDisabled
                ? "bg-neutral-100 dark:bg-neutral-800/50"
                : "bg-neutral-50 dark:bg-neutral-800/80"
            }`}
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                isDisabled
                  ? "bg-neutral-200 dark:bg-neutral-700"
                  : feature.synced
                    ? "bg-emerald-100 dark:bg-emerald-900/50"
                    : "bg-amber-100 dark:bg-amber-900/50"
              }`}
            >
              {feature.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className={`text-sm font-medium ${isDisabled ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-700 dark:text-neutral-200"}`}
              >
                {feature.label}
              </div>
              {feature.note && (
                <div
                  className={`text-xs ${isDisabled ? "text-neutral-400 dark:text-neutral-600" : "text-neutral-500 dark:text-neutral-400"}`}
                >
                  {feature.note}
                </div>
              )}
            </div>
            <div className="shrink-0">
              {feature.synced ? (
                <div className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                  <Check className="h-3 w-3" />
                  {t("settings.region.synced")}
                </div>
              ) : (
                <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                  <X className="h-3 w-3" />
                  {t("settings.region.notSynced")}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Payment Methods */}
      <div className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-700">
        <div
          className={`mb-2 text-xs font-semibold uppercase tracking-wide ${isDisabled ? "text-neutral-400" : "text-neutral-500 dark:text-neutral-400"}`}
        >
          {t("settings.region.paymentMethods")}
        </div>
        <div className="flex flex-wrap gap-2">
          {paymentMethods.map((method, index) => (
            <span
              key={index}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                isDisabled
                  ? "bg-neutral-200 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
                  : `${gradient} text-white shadow-sm`
              }`}
            >
              <Wallet className="h-3 w-3" />
              {method}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export function RegionSettings() {
  const { t } = useTranslation();

  const internationalFeatures: FeatureItem[] = [
    {
      icon: (
        <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      ),
      label: t("settings.region.features.account"),
      synced: true,
    },
    {
      icon: (
        <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      ),
      label: t("settings.region.features.community"),
      synced: true,
    },
    {
      icon: <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
      label: t("settings.region.features.models"),
      synced: false,
      note: t("settings.region.features.modelsNote"),
    },
    {
      icon: (
        <CreditCard className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      ),
      label: t("settings.region.features.subscription"),
      synced: false,
      note: t("settings.region.features.subscriptionNote"),
    },
    {
      icon: (
        <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      ),
      label: t("settings.region.features.chatData"),
      synced: false,
    },
  ];

  const chinaFeatures: FeatureItem[] = [
    {
      icon: <Users className="h-4 w-4 text-neutral-400" />,
      label: t("settings.region.features.account"),
      synced: true,
    },
    {
      icon: <Users className="h-4 w-4 text-neutral-400" />,
      label: t("settings.region.features.community"),
      synced: true,
    },
    {
      icon: <Sparkles className="h-4 w-4 text-neutral-400" />,
      label: t("settings.region.features.models"),
      synced: false,
      note: t("settings.region.features.chinaModelsNote"),
    },
    {
      icon: <CreditCard className="h-4 w-4 text-neutral-400" />,
      label: t("settings.region.features.subscription"),
      synced: false,
      note: t("settings.region.features.chinaSubscriptionNote"),
    },
    {
      icon: <MessageSquare className="h-4 w-4 text-neutral-400" />,
      label: t("settings.region.features.chatData"),
      synced: false,
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
          {t("settings.region.title")}
        </h2>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          {t("settings.region.subtitle")}
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* International Version */}
        <RegionCard
          title={t("settings.region.international.title")}
          subtitle={t("settings.region.international.subtitle")}
          isActive={true}
          features={internationalFeatures}
          paymentMethods={["PayPal", t("settings.region.internationalCard")]}
          gradient="bg-gradient-to-r from-indigo-500 to-purple-500"
          borderColor="border-indigo-200 dark:border-indigo-800/50"
          iconBg="bg-gradient-to-br from-indigo-500 to-purple-600"
        />

        {/* China Mainland Version */}
        <RegionCard
          title={t("settings.region.china.title")}
          subtitle={t("settings.region.china.subtitle")}
          isActive={false}
          isDisabled={true}
          features={chinaFeatures}
          paymentMethods={[
            t("settings.region.wechatPay"),
            t("settings.region.alipay"),
          ]}
          gradient="bg-gradient-to-r from-emerald-500 to-teal-500"
          borderColor="border-emerald-200 dark:border-emerald-800/50"
          iconBg="bg-gradient-to-br from-emerald-500 to-teal-600"
        />
      </div>

      {/* Info Note */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-8 rounded-sm border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-800/50 dark:bg-blue-900/20"
      >
        <div className="flex gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
            <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
              {t("settings.region.note.title")}
            </h4>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              {t("settings.region.note.description")}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
