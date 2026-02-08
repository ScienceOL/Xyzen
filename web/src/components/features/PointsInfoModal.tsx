import { Modal } from "@/components/animate-ui/components/animate/modal";
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/components/animate/tabs";
import {
  CheckIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  LockClosedIcon,
  PlusIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";

interface PointsInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PlanFeature {
  text: string;
  included: boolean;
}

interface SubscriptionPlan {
  name: string;
  price: string;
  originalPrice?: string;
  period: string;
  credits: string;
  creditsNote?: string;
  storage: string;
  highlight?: boolean;
  badge?: string;
  isFree?: boolean;
  isLocked?: boolean;
  lockedReason?: string;
  features: PlanFeature[];
}

const internationalPlans: SubscriptionPlan[] = [
  {
    name: "Free",
    price: "$0",
    period: "",
    credits: "Daily check-in",
    creditsNote: "Resets monthly",
    storage: "100 MB",
    isFree: true,
    features: [
      { text: "Lite models", included: true },
      { text: "Basic features", included: true },
      { text: "Standard models", included: false },
      { text: "Pro models", included: false },
    ],
  },
  {
    name: "Standard",
    price: "$9.9",
    period: "/mo",
    credits: "5,000",
    storage: "1 GB",
    features: [
      { text: "Standard models", included: true },
      { text: "Priority queue", included: true },
      { text: "Pro models", included: false },
      { text: "Ultra models", included: false },
    ],
  },
  {
    name: "Professional",
    price: "$36.9",
    period: "/mo",
    credits: "22,000",
    storage: "10 GB",
    highlight: true,
    badge: "Popular",
    features: [
      { text: "All Standard features", included: true },
      { text: "Pro models", included: true },
      { text: "Priority support", included: true },
      { text: "Ultra models", included: false },
    ],
  },
  {
    name: "Ultra",
    price: "$99.9",
    period: "/mo",
    credits: "60,000",
    storage: "100 GB",
    features: [
      { text: "All Pro features", included: true },
      { text: "Ultra models", included: true },
      { text: "Max performance", included: true },
      { text: "Dedicated support", included: true },
    ],
  },
];

const chinaPlans: SubscriptionPlan[] = [
  {
    name: "免费版",
    price: "¥0",
    period: "",
    credits: "签到获取",
    creditsNote: "次月清空",
    storage: "100 MB",
    isFree: true,
    features: [
      { text: "Lite 模型", included: true },
      { text: "基础功能", included: true },
      { text: "标准模型", included: false },
      { text: "专业模型", included: false },
    ],
  },
  {
    name: "标准版",
    price: "¥25.9",
    originalPrice: "首月 ¥19.9",
    period: "/月",
    credits: "3,000",
    storage: "1 GB",
    features: [
      { text: "标准模型", included: true },
      { text: "优先队列", included: true },
      { text: "专业模型", included: false },
      { text: "Ultra 模型", included: false },
    ],
  },
  {
    name: "专业版",
    price: "¥89.9",
    originalPrice: "首月 ¥79.9",
    period: "/月",
    credits: "10,000",
    storage: "10 GB",
    highlight: true,
    badge: "推荐",
    features: [
      { text: "全部标准功能", included: true },
      { text: "专业模型", included: true },
      { text: "优先技术支持", included: true },
      { text: "Ultra 模型", included: false },
    ],
  },
  {
    name: "Ultra",
    price: "$99.9",
    period: "/mo",
    credits: "60,000",
    storage: "100 GB",
    isLocked: true,
    lockedReason: "仅限国际版",
    features: [
      { text: "全部专业功能", included: true },
      { text: "Ultra 模型", included: true },
      { text: "极致性能", included: true },
      { text: "专属支持", included: true },
    ],
  },
];

function PlanCard({ plan, index }: { plan: SubscriptionPlan; index: number }) {
  const isLocked = plan.isLocked;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35 }}
      className={`relative flex flex-col rounded-xl border-2 p-4 transition-all ${
        isLocked
          ? "border-neutral-200 bg-neutral-100/50 opacity-60 dark:border-neutral-700 dark:bg-neutral-800/20"
          : plan.highlight
            ? "border-indigo-400 bg-gradient-to-b from-indigo-50/80 to-white shadow-md shadow-indigo-100/40 dark:border-indigo-500 dark:from-indigo-500/15 dark:to-neutral-900 dark:shadow-indigo-500/10"
            : plan.isFree
              ? "border-neutral-200 bg-neutral-50/50 dark:border-neutral-700 dark:bg-neutral-800/30"
              : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800/50"
      }`}
    >
      {plan.badge && !isLocked && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-0.5 text-[11px] font-semibold text-white shadow-sm">
          {plan.badge}
        </div>
      )}

      {isLocked && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-neutral-400 px-3 py-0.5 text-[11px] font-medium text-white dark:bg-neutral-600">
          <LockClosedIcon className="h-3 w-3" />
          {plan.lockedReason}
        </div>
      )}

      <div className="mb-3">
        <h3
          className={`text-base font-bold ${isLocked ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-900 dark:text-neutral-50"}`}
        >
          {plan.name}
        </h3>
      </div>

      <div className="mb-3">
        <div className="flex items-baseline gap-0.5">
          <span
            className={`text-2xl font-bold tracking-tight ${isLocked ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-900 dark:text-neutral-50"}`}
          >
            {plan.price}
          </span>
          {plan.period && (
            <span className="text-sm text-neutral-400 dark:text-neutral-500">
              {plan.period}
            </span>
          )}
        </div>
        {plan.originalPrice && !isLocked && (
          <div className="mt-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
            {plan.originalPrice}
          </div>
        )}
      </div>

      <div
        className={`mb-3 flex items-center gap-3 rounded-lg px-3 py-2 ${isLocked ? "bg-neutral-200/50 dark:bg-neutral-700/20" : "bg-neutral-100/80 dark:bg-neutral-700/30"}`}
      >
        <div className="flex items-center gap-1.5">
          <SparklesIcon
            className={`h-4 w-4 ${isLocked ? "text-neutral-400" : "text-amber-500"}`}
          />
          <span
            className={`text-xs font-medium ${isLocked ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-700 dark:text-neutral-300"}`}
          >
            {plan.credits}
          </span>
        </div>
        <div
          className={`h-4 w-px ${isLocked ? "bg-neutral-300 dark:bg-neutral-600" : "bg-neutral-300 dark:bg-neutral-600"}`}
        />
        <div className="flex items-center gap-1.5">
          <svg
            className={`h-4 w-4 ${isLocked ? "text-neutral-400" : "text-blue-500"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
            />
          </svg>
          <span
            className={`text-xs font-medium ${isLocked ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-700 dark:text-neutral-300"}`}
          >
            {plan.storage}
          </span>
        </div>
      </div>

      <div className="mb-3 flex-1 space-y-1.5">
        {plan.features.map((feature, i) => (
          <div key={i} className="flex items-center gap-2">
            {feature.included ? (
              <CheckIcon
                className={`h-3.5 w-3.5 ${isLocked ? "text-neutral-400" : "text-green-500"}`}
              />
            ) : (
              <div className="h-3.5 w-3.5 rounded-full border border-neutral-300 dark:border-neutral-600" />
            )}
            <span
              className={`text-xs ${
                isLocked
                  ? "text-neutral-400 dark:text-neutral-500"
                  : feature.included
                    ? "text-neutral-600 dark:text-neutral-400"
                    : "text-neutral-400 dark:text-neutral-500"
              }`}
            >
              {feature.text}
            </span>
          </div>
        ))}
      </div>

      <button
        disabled
        className={`w-full cursor-not-allowed rounded-lg py-2 text-xs font-semibold ${
          isLocked
            ? "bg-neutral-200 text-neutral-400 dark:bg-neutral-700 dark:text-neutral-500"
            : "bg-neutral-200 text-neutral-400 dark:bg-neutral-700 dark:text-neutral-500"
        }`}
      >
        即将上线
      </button>
    </motion.div>
  );
}

function TopUpCard({
  region,
  delay,
}: {
  region: "international" | "china";
  delay: number;
}) {
  const isChina = region === "china";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="flex items-center justify-between rounded-lg border border-dashed border-neutral-300 bg-neutral-50/50 px-4 py-3 dark:border-neutral-600 dark:bg-neutral-800/30"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
          <PlusIcon className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            {isChina ? "积分加量包" : "Credit Top-up"}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {isChina ? "随时补充，按需购买" : "Pay as you go"}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
          {isChina ? "100 积分 = ¥1" : "500 credits = $1"}
        </div>
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {isChina ? "支付宝 / 微信" : "PayPal / Credit Cards"}
        </div>
      </div>
    </motion.div>
  );
}

export function PointsInfoModal({ isOpen, onClose }: PointsInfoModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="选择订阅方案"
      maxWidth="max-w-5xl"
    >
      <div className="relative max-h-[70vh] overflow-y-auto px-2 py-2">
        <div className="space-y-4">
          <Tabs defaultValue="international">
            <TabsList className="mx-auto w-fit">
              <TabsTrigger value="international" className="gap-2 px-5">
                <GlobeAltIcon className="h-4 w-4" />
                International
              </TabsTrigger>
              <TabsTrigger value="china" className="gap-2 px-5">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                </svg>
                中国大陆
              </TabsTrigger>
            </TabsList>

            <TabsContents>
              <TabsContent value="international">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  className="mt-4 space-y-4"
                >
                  <div className="grid grid-cols-4 gap-3">
                    {internationalPlans.map((plan, index) => (
                      <PlanCard key={plan.name} plan={plan} index={index} />
                    ))}
                  </div>
                  <TopUpCard region="international" delay={0.3} />
                </motion.div>
              </TabsContent>

              <TabsContent value="china">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  className="mt-4 space-y-4"
                >
                  <div className="grid grid-cols-4 gap-3">
                    {chinaPlans.map((plan, index) => (
                      <PlanCard key={plan.name} plan={plan} index={index} />
                    ))}
                  </div>
                  <TopUpCard region="china" delay={0.3} />
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.35 }}
                    className="text-center text-xs text-neutral-500 dark:text-neutral-400"
                  >
                    订阅服务不与国际版互通
                  </motion.p>
                </motion.div>
              </TabsContent>
            </TabsContents>
          </Tabs>

          {/* Beta notice */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-lg border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 dark:border-amber-500/30 dark:from-amber-500/10 dark:to-orange-500/10"
          >
            <p className="text-center text-xs text-amber-700 dark:text-amber-300">
              内测期间暂不支持外部充值，欢迎加入内测群了解最新动态
            </p>
          </motion.div>

          {/* Survey link */}
          <motion.a
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.45 }}
            whileHover={{ scale: 1.005 }}
            whileTap={{ scale: 0.995 }}
            href="https://sii-czxy.feishu.cn/share/base/form/shrcnYu8Y3GNgI7M14En1xJ7rMb"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-3 transition-all hover:border-indigo-300 hover:shadow-sm dark:border-indigo-500/30 dark:from-indigo-500/10 dark:to-purple-500/10 dark:hover:border-indigo-400/50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-sm">
              <DocumentTextIcon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                填写内测问卷
              </div>
              <div className="text-xs text-indigo-600/70 dark:text-indigo-300/70">
                参与内测获取更多额度
              </div>
            </div>
            <svg
              className="h-4 w-4 text-indigo-400 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          </motion.a>

          <div className="flex justify-end border-t border-neutral-100 pt-3 dark:border-neutral-800">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={onClose}
              className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 focus:outline-none dark:bg-indigo-600 dark:hover:bg-indigo-500"
            >
              知道了
            </motion.button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
