import { Modal } from "@/components/animate-ui/components/animate/modal";
import { DocumentTextIcon } from "@heroicons/react/24/outline";
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
      title="积分用尽"
      maxWidth="max-w-md"
    >
      <div className="relative space-y-5 text-[15px] text-neutral-700 dark:text-neutral-200 mx-3 my-2">
        {/* 说明文字 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-neutral-600 dark:text-neutral-300 leading-relaxed"
        >
          <p>
            您的积分已用尽。目前产品处于内测阶段，欢迎填写问卷参与内测，获取更多使用额度。
          </p>
        </motion.div>

        {/* 问卷链接卡片 */}
        <motion.a
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          href="https://sii-czxy.feishu.cn/share/base/form/shrcnYu8Y3GNgI7M14En1xJ7rMb"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-4 rounded-sm border border-indigo-200 bg-indigo-50/50 p-4 transition-colors hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-500/20"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
            <DocumentTextIcon className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-indigo-900 dark:text-indigo-100">
              填写内测问卷
            </div>
            <div className="text-[13px] text-indigo-600/70 dark:text-indigo-300/70">
              参与内测获取更多额度
            </div>
          </div>
          <svg
            className="h-5 w-5 text-indigo-400 opacity-0 transition-opacity group-hover:opacity-100"
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

        <div className="flex justify-end border-t border-neutral-100 pt-4 dark:border-neutral-800">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={onClose}
            className="rounded-sm bg-neutral-900 px-5 py-2 text-[14px] font-medium text-white transition-colors hover:bg-neutral-800 focus:outline-none dark:bg-indigo-600 dark:hover:bg-indigo-500"
          >
            知道了
          </motion.button>
        </div>
      </div>
    </Modal>
  );
}
