"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/animate-ui/components/animate/tooltip";
import { Badge } from "@/components/base/Badge";
import ChatStatusBadge from "@/components/base/ChatStatusBadge";
import { formatTime } from "@/lib/formatDate";
import type { Agent } from "@/types/agents";
import {
  PencilIcon,
  ShoppingBagIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { motion, type Variants } from "framer-motion";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

// Swipe action layout constants
const SWIPE_THRESHOLD = 45;
const ACTION_WIDTH = 92; // 2×36px buttons + 8px gap + 12px right pad

// Animation variants for detailed variant
const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 12,
    },
  },
};

// Context menu component
interface ContextMenuProps {
  x: number;
  y: number;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  isDefaultAgent?: boolean;
  isMarketplacePublished?: boolean;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onEdit,
  onDelete,
  onClose,
  isDefaultAgent = false,
  isMarketplacePublished = false,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const isReadyRef = useRef(false);

  useEffect(() => {
    // Delay enabling outside click detection to prevent immediate close from touch events
    const readyTimer = setTimeout(() => {
      isReadyRef.current = true;
    }, 100);

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (!isReadyRef.current) return;
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      clearTimeout(readyTimer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className="fixed z-[9999] w-48 rounded-sm border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
      style={{ left: x, top: y }}
    >
      <button
        onClick={() => {
          onEdit();
          onClose();
        }}
        className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700 ${
          isDefaultAgent ? "rounded-lg" : "rounded-t-lg"
        }`}
      >
        <PencilIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        {t("agents.editAgent")}
      </button>
      {isMarketplacePublished ? (
        <Tooltip side="right">
          <TooltipTrigger asChild>
            <span className="block w-full">
              <button
                disabled
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="flex w-full cursor-not-allowed items-center gap-2 rounded-b-lg px-4 py-2.5 text-left text-sm text-neutral-700 opacity-50 transition-colors dark:text-neutral-300"
              >
                <TrashIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
                {t("agents.deleteAgent")}
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {t("agents.deleteBlockedMessage", {
              defaultValue:
                "This agent is published to Agent Market. Please unpublish it first, then delete it.",
            })}
          </TooltipContent>
        </Tooltip>
      ) : (
        <button
          onClick={() => {
            onDelete();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-b-lg px-4 py-2.5 text-left text-sm text-neutral-700 transition-colors hover:bg-red-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          <TrashIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
          {t("agents.deleteAgent")}
        </button>
      )}
    </motion.div>
  );
};

// Whole-item drag props (replaces old DragHandleProps)
export interface WholeDragProps {
  attributes: React.HTMLAttributes<HTMLElement>;
  listeners: React.DOMAttributes<HTMLElement>;
}

// Shared props for both variants
interface AgentListItemBaseProps {
  agent: Agent;
  onClick?: (agent: Agent) => void;
  // Loading state (breathing animation)
  isLoading?: boolean;
  // Drag and drop support
  isDragging?: boolean;
  sortMode?: boolean;
  onLongPress?: () => void;
  wholeDragProps?: WholeDragProps;
  style?: React.CSSProperties;
  setNodeRef?: (node: HTMLElement | null) => void;
}

// Props specific to detailed variant
interface DetailedVariantProps extends AgentListItemBaseProps {
  variant: "detailed";
  isMarketplacePublished?: boolean;
  lastConversationTime?: string;
  activeTopicCount?: number;
  onEdit?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
  // Compact variant props not used
  isSelected?: never;
  status?: never;
  role?: never;
}

// Props specific to compact variant
interface CompactVariantProps extends AgentListItemBaseProps {
  variant: "compact";
  isSelected?: boolean;
  status?: "idle" | "busy";
  role?: string;
  // Right-click menu support (shared with detailed)
  isMarketplacePublished?: boolean;
  onEdit?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
  // Detailed variant props not used
  lastConversationTime?: never;
}

export type AgentListItemProps = DetailedVariantProps | CompactVariantProps;

/**
 * Long-press hook for triggering sort mode (touch-only, 700ms).
 * Cancels if pointer moves >8px, or if a vertical (downward) gesture is
 * detected — preventing false triggers when the user pulls down to reveal
 * the CEO overlay.
 */
function useLongPress(onLongPress?: () => void, disabled?: boolean) {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !onLongPress || e.pointerType !== "touch") return;
      firedRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };
      clear();
      timerRef.current = window.setTimeout(() => {
        // Suppress long-press if an overscroll pull gesture is active
        // (useOverscrollPull sets data-pull-zone / data-pulling on the container)
        const container =
          startRef.current &&
          document.querySelector("[data-pulling], [data-pull-zone]");
        if (container) {
          clear();
          return;
        }
        firedRef.current = true;
        try {
          if ("vibrate" in navigator) navigator.vibrate(10);
        } catch {
          // ignore
        }
        onLongPress();
      }, 700);
    },
    [disabled, onLongPress, clear],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const start = startRef.current;
      if (!start) return;
      const dy = e.clientY - start.y;
      // Cancel on any movement > 8px, or on downward movement > 4px
      // (downward gesture likely means pull-to-reveal, not long-press)
      if (Math.hypot(e.clientX - start.x, dy) > 8 || dy > 4) {
        clear();
      }
    },
    [clear],
  );

  const onPointerUp = useCallback(() => clear(), [clear]);
  const onPointerCancel = useCallback(() => clear(), [clear]);

  // Clean up on unmount
  useEffect(() => () => clear(), [clear]);

  return {
    /** Event handlers — safe to spread onto a DOM element. */
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
    /** Whether the long-press fired (use to suppress click) */
    didFire: firedRef,
    /** Whether a touch long-press is currently being tracked (timer active). */
    isTracking: () => startRef.current !== null,
  };
}

/** iOS-style swipe action buttons (edit + delete) */
const SwipeActions: React.FC<{
  isMarketplacePublished: boolean;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  t: (key: string, opts?: Record<string, string>) => string;
}> = ({ isMarketplacePublished, onEdit, onDelete, t }) => (
  <div className="absolute inset-y-0 right-0 flex items-center justify-end gap-2 pr-3">
    <button
      onClick={onEdit}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200/80 text-neutral-600 active:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-300 dark:active:bg-neutral-600"
    >
      <PencilIcon className="h-4 w-4" />
    </button>
    {isMarketplacePublished ? (
      <Tooltip side="top">
        <TooltipTrigger asChild>
          <button
            disabled
            className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200/80 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {t("agents.deleteBlockedMessage", {
            defaultValue:
              "This agent is published to Agent Market. Please unpublish it first, then delete it.",
          })}
        </TooltipContent>
      </Tooltip>
    ) : (
      <button
        onClick={onDelete}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-red-500 active:bg-red-200 dark:bg-red-900/40 dark:text-red-400 dark:active:bg-red-800/50"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    )}
  </div>
);

// Detailed variant component (for sidebar)
const DetailedAgentListItem: React.FC<DetailedVariantProps> = ({
  agent,
  isMarketplacePublished = false,
  lastConversationTime,
  activeTopicCount = 0,
  onClick,
  onEdit,
  onDelete,
  isLoading = false,
  isDragging = false,
  sortMode = false,
  onLongPress,
  wholeDragProps,
  style,
  setNodeRef,
}) => {
  const { t } = useTranslation();
  // Desktop right-click menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Mobile swipe state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiped, setIsSwiped] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeStartOffset = useRef(0);
  const isSwipingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentElRef = useRef<HTMLDivElement | null>(null);

  // Stable ref for sortMode so the native listener always reads the latest value
  const sortModeRef = useRef(sortMode);
  sortModeRef.current = sortMode;

  // Check if it's a default agent based on tags
  const isDefaultAgent = agent.tags?.some((tag) => tag.startsWith("default_"));

  // Long-press to enter sort mode (disabled when already in sort mode)
  const longPress = useLongPress(onLongPress, sortMode);

  // Close swipe when clicking outside
  useEffect(() => {
    if (!isSwiped) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsSwiped(false);
        setSwipeOffset(0);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isSwiped]);

  // Non-passive touchmove listener to allow preventDefault during horizontal swipe
  useEffect(() => {
    const el = contentElRef.current;
    if (!el) return;

    const onTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current || sortModeRef.current) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;

      if (!isSwipingRef.current) {
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
          isSwipingRef.current = true;
        } else if (Math.abs(deltaY) > 10) {
          touchStartRef.current = null;
          return;
        }
      }

      if (isSwipingRef.current) {
        if (e.cancelable) e.preventDefault();
        const newOffset = Math.min(
          0,
          Math.max(-ACTION_WIDTH, swipeStartOffset.current + deltaX),
        );
        setSwipeOffset(newOffset);
      }
    };

    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  // Desktop right-click handler (suppress in sort mode / after long-press /
  // during active touch tracking to prevent the native mobile context menu)
  const handleContextMenu = (e: React.MouseEvent) => {
    // Always suppress while a touch long-press is tracked or has fired
    if (longPress.isTracking() || longPress.didFire.current) {
      e.preventDefault();
      return;
    }
    if (sortMode) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  // Mobile swipe handlers (disabled in sort mode)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (sortMode) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    swipeStartOffset.current = swipeOffset;
    isSwipingRef.current = false;
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current) return;

    // Snap to open or closed position
    if (swipeOffset < -SWIPE_THRESHOLD) {
      setSwipeOffset(-ACTION_WIDTH);
      setIsSwiped(true);
    } else {
      setSwipeOffset(0);
      setIsSwiped(false);
    }

    touchStartRef.current = null;
    isSwipingRef.current = false;
  };

  const handleClick = () => {
    if (isDragging) return;
    if (longPress.didFire.current) return;
    // If swiped, close it instead of navigating
    if (isSwiped) {
      setIsSwiped(false);
      setSwipeOffset(0);
      return;
    }
    if (sortMode) return;
    onClick?.(agent);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSwiped(false);
    setSwipeOffset(0);
    onEdit?.(agent);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSwiped(false);
    setSwipeOffset(0);
    onDelete?.(agent);
  };

  const itemContent = (
    <>
      {/* Avatar */}
      <div className="h-10 w-10 shrink-0 avatar-glow">
        <img
          src={
            agent.avatar ||
            "https://api.dicebear.com/7.x/avataaars/svg?seed=default"
          }
          alt={agent.name}
          className="h-10 w-10 rounded-full border border-neutral-200 object-cover dark:border-neutral-700"
        />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col min-w-0 select-none">
        <div className="flex items-center gap-2">
          <h3
            className="text-sm font-semibold text-neutral-800 dark:text-white truncate shrink"
            title={agent.name}
          >
            {agent.name}
          </h3>

          {/* Marketplace published badge */}
          {isMarketplacePublished && (
            <Tooltip side="right">
              <TooltipTrigger asChild>
                <span className="shrink-0">
                  <Badge
                    variant="yellow"
                    className="flex items-center justify-center px-1.5!"
                  >
                    <ShoppingBagIcon className="h-3.5 w-3.5" />
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {t("agents.badges.marketplace", {
                  defaultValue: "Published to Marketplace",
                })}
              </TooltipContent>
            </Tooltip>
          )}

          {activeTopicCount > 0 && (
            <ChatStatusBadge status="running" size="xs" className="shrink-0" />
          )}
        </div>

        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
          {agent.description}
        </p>

        {/* Last conversation time */}
        {lastConversationTime && (
          <p className="mt-1.5 text-[10px] text-neutral-400 dark:text-neutral-500">
            {formatTime(lastConversationTime)}
          </p>
        )}
      </div>
    </>
  );

  // When inside SortableItem (setNodeRef provided), use simple div to avoid motion conflicts
  if (setNodeRef) {
    return (
      <>
        {/* Outer: dnd-kit positioning (transform/transition) — no CSS animation here */}
        <div
          ref={(node) => {
            setNodeRef(node);
            (
              containerRef as React.MutableRefObject<HTMLDivElement | null>
            ).current = node;
          }}
          style={style}
          className={isDragging ? "z-50" : ""}
        >
          {/* Inner: jiggle animation (separate div so CSS animation doesn't override dnd-kit transform) */}
          <div
            className={`relative overflow-hidden ${sortMode && !isDragging ? "agent-jiggle" : ""}`}
          >
            {/* Swipe action buttons - hidden during loading or sort mode */}
            {!isLoading && !sortMode && (
              <SwipeActions
                isMarketplacePublished={isMarketplacePublished}
                onEdit={handleEditClick}
                onDelete={handleDeleteClick}
                t={t}
              />
            )}

            {/* Main content (slides left on swipe) */}
            <div
              ref={contentElRef}
              onClick={handleClick}
              onContextMenu={handleContextMenu}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              {...longPress.handlers}
              {...(sortMode ? wholeDragProps?.attributes : {})}
              {...(sortMode ? wholeDragProps?.listeners : {})}
              style={{ transform: `translateX(${swipeOffset}px)` }}
              className={`
                relative w-full flex cursor-pointer items-center gap-3 px-4 py-3
                bg-white dark:bg-neutral-900
                ${agent.id === "default-chat" ? "select-none" : ""}
                ${isDragging ? "shadow-xl cursor-grabbing" : ""}
                ${sortMode ? "touch-none" : ""}
                ${!isSwiped && !sortMode ? "active:bg-neutral-50 dark:active:bg-neutral-800" : ""}
                ${isLoading ? "animate-pulse" : ""}
                transition-transform duration-200 ease-out
              `}
            >
              {itemContent}
            </div>
          </div>
        </div>

        {/* Desktop context menu */}
        {contextMenu &&
          createPortal(
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              onEdit={() => onEdit?.(agent)}
              onDelete={() => onDelete?.(agent)}
              onClose={() => setContextMenu(null)}
              isDefaultAgent={isDefaultAgent}
              isMarketplacePublished={isMarketplacePublished}
            />,
            document.body,
          )}
      </>
    );
  }

  // Non-sortable: use motion.div with animations
  return (
    <>
      <div ref={containerRef} className="relative overflow-hidden">
        {/* Swipe action buttons - hidden during loading to prevent flicker */}
        {!isLoading && (
          <SwipeActions
            isMarketplacePublished={isMarketplacePublished}
            onEdit={handleEditClick}
            onDelete={handleDeleteClick}
            t={t}
          />
        )}

        {/* Main content (slides left on swipe) */}
        <motion.div
          ref={contentElRef}
          layout={!isDragging}
          variants={itemVariants}
          whileHover={
            isDragging || isSwiped
              ? undefined
              : { scale: 1.02, transition: { duration: 0.2 } }
          }
          whileTap={isDragging || isSwiped ? undefined : { scale: 0.98 }}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          {...longPress.handlers}
          animate={{ x: swipeOffset }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={`
            relative w-full flex cursor-pointer items-center gap-3 px-4 py-3
            bg-white dark:bg-neutral-900
            ${agent.id === "default-chat" ? "select-none" : ""}
            ${isDragging ? "shadow-xl z-50 cursor-grabbing" : ""}
            ${!isSwiped ? "active:bg-neutral-50 dark:active:bg-neutral-800" : ""}
            ${isLoading ? "animate-pulse" : ""}
          `}
        >
          {itemContent}
        </motion.div>
      </div>

      {/* Desktop context menu - rendered via portal to escape overflow:hidden containers */}
      {contextMenu &&
        createPortal(
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onEdit={() => onEdit?.(agent)}
            onDelete={() => onDelete?.(agent)}
            onClose={() => setContextMenu(null)}
            isDefaultAgent={isDefaultAgent}
            isMarketplacePublished={isMarketplacePublished}
          />,
          document.body,
        )}
    </>
  );
};

// Compact variant component (for spatial workspace switcher)
const CompactAgentListItem: React.FC<CompactVariantProps> = ({
  agent,
  isSelected = false,
  status = "idle",
  role,
  isMarketplacePublished = false,
  onClick,
  onEdit,
  onDelete,
  isDragging = false,
  sortMode = false,
  onLongPress,
  wholeDragProps,
  style,
  setNodeRef,
}) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Check if it's a default agent based on tags
  const isDefaultAgent = agent.tags?.some((tag) => tag.startsWith("default_"));

  // Long-press to enter sort mode
  const longPress = useLongPress(onLongPress, sortMode);

  const handleContextMenu = (e: React.MouseEvent) => {
    // Suppress native context menu during touch long-press tracking
    if (longPress.isTracking() || longPress.didFire.current) {
      e.preventDefault();
      return;
    }
    if (!onEdit && !onDelete) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        data-agent-id={agent.id}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        onClick={() => {
          if (isDragging) return;
          if (longPress.didFire.current) return;
          if (sortMode) return;
          onClick?.(agent);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!isDragging && !sortMode) {
              onClick?.(agent);
            }
          }
        }}
        onContextMenu={handleContextMenu}
        {...longPress.handlers}
        {...(sortMode ? wholeDragProps?.attributes : {})}
        {...(sortMode ? wholeDragProps?.listeners : {})}
        className={`w-full flex items-center gap-3 p-2 rounded-sm transition-all duration-200 group ${
          isSelected
            ? "bg-white/80 dark:bg-white/20 shadow-sm"
            : "hover:bg-white/40 dark:hover:bg-white/10"
        } ${isDragging ? "shadow-xl z-50 cursor-grabbing" : "cursor-pointer"} ${sortMode && !isDragging ? "agent-jiggle" : ""} ${sortMode ? "touch-none" : ""}`}
      >
        <div className="relative">
          <img
            src={
              agent.avatar ||
              "https://api.dicebear.com/7.x/avataaars/svg?seed=default"
            }
            alt={agent.name}
            className="w-10 h-10 rounded-full border border-white/50 object-cover"
          />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              {agent.name}
            </div>
            {status === "busy" && (
              <ChatStatusBadge
                status="running"
                size="xs"
                showLabel={false}
                className="shrink-0"
              />
            )}
          </div>
          {role && (
            <div className="truncate text-[10px] text-neutral-500">{role}</div>
          )}
        </div>
      </div>

      {/* Desktop context menu */}
      {contextMenu &&
        (onEdit || onDelete) &&
        createPortal(
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onEdit={() => onEdit?.(agent)}
            onDelete={() => onDelete?.(agent)}
            onClose={() => setContextMenu(null)}
            isDefaultAgent={isDefaultAgent}
            isMarketplacePublished={isMarketplacePublished}
          />,
          document.body,
        )}
    </>
  );
};

// Main component that switches between variants
export const AgentListItem: React.FC<AgentListItemProps> = (props) => {
  if (props.variant === "detailed") {
    return <DetailedAgentListItem {...props} />;
  }
  return <CompactAgentListItem {...props} />;
};

export default AgentListItem;
