import { Modal } from "@/components/animate-ui/primitives/headless/modal";
import {
  BoltIcon,
  CurrencyYenIcon,
  FireIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";

interface PointsInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}
export function PointsInfoModal({ isOpen, onClose }: PointsInfoModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="积分与充值说明"
      maxWidth="max-w-lg"
    >
      <div className="relative space-y-6 text-sm text-neutral-700 dark:text-neutral-200">
        {/* 装饰性背景光晕 - 仅深色模式 */}
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-500/20" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl dark:bg-purple-500/20" />

        {/* 核心机制说明 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50/80 p-4 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/60"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
              <BoltIcon className="h-4 w-4" />
            </div>
            <p className="leading-relaxed text-neutral-600 dark:text-neutral-300">
              在 Bohrium 平台使用时，将自动使用
              <span className="mx-1 font-bold text-indigo-600 dark:text-indigo-400">
                光子
              </span>
              兑换等量积分。
            </p>
          </div>
        </motion.div>

        {/* 价格对比卡片 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="group relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/30 p-1 dark:border-indigo-500/30 dark:from-neutral-900 dark:to-neutral-800"
        >
          {/* 流光边框效果 */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/10 to-transparent opacity-0 transition-opacity duration-1000 group-hover:animate-shimmer group-hover:opacity-100 dark:via-indigo-400/20" />

          <div className="relative rounded-xl bg-white/50 p-5 dark:bg-neutral-900/80">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-orange-100 p-1.5 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400">
                  <FireIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900 dark:text-white">
                    限时特惠活动
                  </h3>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    Limited Time Offer
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-gradient-to-r from-orange-500 to-red-500 px-3 py-1 text-xs font-bold text-white shadow-lg shadow-orange-500/30">
                1.5 折
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* 官方定价 */}
              <div className="flex flex-col justify-between rounded-xl border border-neutral-100 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-800/50">
                <div className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  官方定价
                </div>
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-neutral-400 line-through decoration-neutral-400/50">
                      $10
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      /百万 tokens
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-neutral-400">
                    (约 ¥72)
                  </div>
                </div>
              </div>

              {/* 当前特惠 */}
              <div className="relative flex flex-col justify-between overflow-hidden rounded-xl bg-indigo-600 p-3 text-white shadow-lg shadow-indigo-500/30 dark:bg-indigo-600 dark:shadow-indigo-900/50">
                <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-white/10 blur-xl" />
                <div className="relative">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-indigo-100">
                      当前特惠
                    </span>
                    <SparklesIcon className="h-3 w-3 text-yellow-300" />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold tracking-tight">
                      ¥10
                    </span>
                    <span className="text-[10px] text-indigo-100/80">
                      /百万 tokens
                    </span>
                  </div>
                  <div className="mt-1 rounded-full bg-white/20 px-1.5 py-0.5 text-center text-[10px] font-medium text-white backdrop-blur-sm">
                    超高性价比
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* 充值引导 */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            获取光子方式
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <motion.a
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              href="https://scimaster.bohrium.com/chat/recharge"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:shadow-md dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-500/20"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 shadow-sm dark:bg-indigo-500/20 dark:text-indigo-300">
                  <CurrencyYenIcon className="h-6 w-6" />
                </div>
                <div>
                  <span className="block font-bold text-indigo-900 dark:text-indigo-100">
                    直接充值
                  </span>
                  <span className="text-[10px] text-indigo-600/80 dark:text-indigo-300/80">
                    推荐方式
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-indigo-900 dark:text-indigo-200">
                  ¥19.8 兑换 1200 光子
                </div>
                <div className="flex items-center gap-1 text-[10px] text-indigo-600/80 dark:text-indigo-400/80">
                  <span className="inline-block h-1 w-1 rounded-full bg-indigo-400" />
                  进入后请选择“三天体验”
                </div>
              </div>
              {/* 装饰性箭头 */}
              <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100">
                <svg
                  className="h-4 w-4 text-indigo-400"
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
              </div>
            </motion.a>

            <motion.a
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              href="https://www.bohrium.com/assets/?menu=upgrade"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:shadow-md dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-neutral-600 dark:hover:bg-neutral-700"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 shadow-sm dark:bg-neutral-700 dark:text-neutral-300">
                  <SparklesIcon className="h-6 w-6" />
                </div>
                <div>
                  <span className="block font-bold text-neutral-900 dark:text-neutral-100">
                    会员订阅
                  </span>
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    长期使用
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Bohrium 会员权益
                </div>
                <div className="flex items-center gap-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                  <span className="inline-block h-1 w-1 rounded-full bg-neutral-400" />
                  每月赠送光子
                </div>
              </div>
              <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100">
                <svg
                  className="h-4 w-4 text-neutral-400"
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
              </div>
            </motion.a>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end border-t border-neutral-100 pt-4 dark:border-neutral-800">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={onClose}
          className="rounded-lg bg-neutral-900 px-6 py-2 text-sm font-medium text-white shadow-lg shadow-neutral-500/20 transition-colors hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 dark:bg-indigo-600 dark:text-white dark:shadow-indigo-500/30 dark:hover:bg-indigo-500"
        >
          知道了
        </motion.button>
      </div>
    </Modal>
  );
}
