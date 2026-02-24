import { DEFAULT_TOPIC_TITLE_KEY } from "@/configs/common";
import type { OpenTab } from "../hooks/useAgentTopics";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import i18n from "i18next";
import { useCallback, useEffect, useRef } from "react";

interface TopicTabBarProps {
  tabs: OpenTab[];
  activeTopicId: string | null;
  respondingTopicIds: Set<string>;
  onSelectTopic: (topicId: string) => void;
  onCloseTopic: (topicId: string) => void;
  onCreateTopic: () => void;
}

export function TopicTabBar({
  tabs,
  activeTopicId,
  respondingTopicIds,
  onSelectTopic,
  onCloseTopic,
  onCreateTopic,
}: TopicTabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Convert vertical wheel to horizontal scroll (VS Code-style)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Auto-scroll to active tab when it changes
  // NOTE: Do NOT use scrollIntoView here — it bubbles up and scrolls
  // ancestor containers (including ReactFlow), shifting the whole canvas.
  useEffect(() => {
    if (!activeTopicId || !scrollRef.current) return;
    const activeEl = scrollRef.current.querySelector(
      `[data-topic-id="${activeTopicId}"]`,
    ) as HTMLElement | null;
    if (activeEl) {
      const container = scrollRef.current;
      const elLeft = activeEl.offsetLeft - container.offsetLeft;
      const elRight = elLeft + activeEl.offsetWidth;
      // Only scroll if the tab is outside the visible area
      if (elLeft < container.scrollLeft) {
        container.scrollTo({ left: elLeft, behavior: "smooth" });
      } else if (elRight > container.scrollLeft + container.clientWidth) {
        container.scrollTo({
          left: elRight - container.clientWidth,
          behavior: "smooth",
        });
      }
    }
  }, [activeTopicId]);

  const handleSelect = useCallback(
    (topicId: string) => {
      if (topicId !== activeTopicId) {
        onSelectTopic(topicId);
      }
    },
    [activeTopicId, onSelectTopic],
  );

  const handleClose = useCallback(
    (e: React.MouseEvent, topicId: string) => {
      e.stopPropagation();
      onCloseTopic(topicId);
    },
    [onCloseTopic],
  );

  // Hide when only 1 tab and it's already active (nothing to switch to)
  if (tabs.length <= 1) return null;

  return (
    <div className="shrink-0 border-b border-black/5 dark:border-white/5">
      <div
        ref={scrollRef}
        className="flex items-center gap-0.5 overflow-x-auto px-2 py-1 custom-scrollbar-thin"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTopicId;
          const isResponding = respondingTopicIds.has(tab.id);

          return (
            <div
              key={tab.id}
              data-topic-id={tab.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSelect(tab.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelect(tab.id);
                }
              }}
              className={`group shrink-0 flex items-center gap-1 rounded-lg pl-2.5 pr-1 py-1 text-[13px] transition-colors duration-150 max-w-[180px] cursor-pointer ${
                isActive
                  ? "bg-neutral-100/60 dark:bg-white/[0.06] font-medium text-neutral-800 dark:text-neutral-200"
                  : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/40 dark:hover:bg-white/[0.03] hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
            >
              {isResponding && (
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-indigo-500" />
                </span>
              )}
              <span className="truncate">
                {tab.name || i18n.t(DEFAULT_TOPIC_TITLE_KEY)}
              </span>
              <button
                onClick={(e) => handleClose(e, tab.id)}
                className="shrink-0 ml-0.5 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-opacity duration-150"
                title="Close tab"
              >
                <XMarkIcon className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        {/* New topic button */}
        <button
          onClick={onCreateTopic}
          className="shrink-0 flex items-center justify-center rounded-lg p-1 text-neutral-400 hover:bg-neutral-100/40 dark:hover:bg-white/[0.03] hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors duration-150"
          title="New topic"
        >
          <PlusIcon className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
