"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import type { SearchCitation } from "@/store/types";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";

interface SearchCitationsProps {
  citations: SearchCitation[];
}

export function SearchCitations({ citations }: SearchCitationsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 border-t border-neutral-200 dark:border-neutral-800 pt-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
      >
        <MagnifyingGlassIcon className="h-4 w-4 text-blue-500" />
        <span>Search Results ({citations.length})</span>
        <motion.span
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-neutral-500"
        >
          ▼
        </motion.span>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2">
              {citations.map((citation, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-3 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  {citation.url && (
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block group"
                    >
                      {citation.title && (
                        <div className="font-medium text-sm text-blue-600 dark:text-blue-400 group-hover:underline mb-1">
                          {citation.title}
                        </div>
                      )}
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 break-all">
                        {citation.url}
                      </div>
                      {citation.cited_text && (
                        <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-300 italic line-clamp-2">
                          "{citation.cited_text}"
                        </div>
                      )}
                      {citation.search_queries &&
                        citation.search_queries.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {citation.search_queries.map((query, qIndex) => (
                              <span
                                key={qIndex}
                                className="inline-block rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300"
                              >
                                {query}
                              </span>
                            ))}
                          </div>
                        )}
                    </a>
                  )}
                  {!citation.url && citation.cited_text && (
                    <div className="text-xs text-neutral-600 dark:text-neutral-300 italic">
                      "{citation.cited_text}"
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
