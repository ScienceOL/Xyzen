import { useXyzen } from "@/index";
import { motion } from "framer-motion";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";

const EmptyChat: React.FC = () => {
  const { t } = useTranslation();
  const [isCreating] = useState(false);

  const createDefaultChannel = useXyzen((s) => s.createDefaultChannel);

  return (
    <div className="flex h-full flex-col items-center justify-center space-y-6 p-4 text-center">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="rounded-full bg-neutral-100 p-4 dark:bg-neutral-800"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8 text-neutral-500 dark:text-neutral-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"
          />
        </svg>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <h3 className="text-lg font-medium text-neutral-900 dark:text-white">
          {t("app.emptyChat.title")}
        </h3>
        <p className="mt-2 max-w-md text-sm text-neutral-600 dark:text-neutral-300">
          {t("app.emptyChat.description")}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="flex flex-col space-y-3 sm:flex-row sm:space-x-3 sm:space-y-0"
      >
        <button
          onClick={() => createDefaultChannel()}
          disabled={isCreating}
          className={`flex items-center justify-center rounded-sm ${
            isCreating
              ? "bg-indigo-400 dark:bg-indigo-700"
              : "bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          } px-4 py-2 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
        >
          {isCreating ? (
            <>
              <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              {t("app.emptyChat.creating")}
            </>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="mr-2 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              {t("app.emptyChat.startChat")}
            </>
          )}
        </button>
      </motion.div>
    </div>
  );
};

export default EmptyChat;
