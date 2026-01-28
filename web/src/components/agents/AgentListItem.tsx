"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/animate-ui/components/animate/tooltip";
import { Badge } from "@/components/base/Badge";
import { formatTime } from "@/lib/formatDate";
import type { Agent } from "@/types/agents";
import {
  PencilIcon,
  ShoppingBagIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { motion, type Variants } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
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
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
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
      className="fixed z-50 w-48 rounded-sm border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
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

// Drag handle props type
export interface DragHandleProps {
  attributes: React.HTMLAttributes<HTMLElement>;
  listeners: React.DOMAttributes<HTMLElement>;
}

// Shared props for both variants
interface AgentListItemBaseProps {
  agent: Agent;
  onClick?: (agent: Agent) => void;
  // Drag and drop support
  isDragging?: boolean;
  dragHandleProps?: DragHandleProps;
  style?: React.CSSProperties;
  setNodeRef?: (node: HTMLElement | null) => void;
}

// Props specific to detailed variant
interface DetailedVariantProps extends AgentListItemBaseProps {
  variant: "detailed";
  isMarketplacePublished?: boolean;
  lastConversationTime?: string;
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

// Detailed variant component (for sidebar)
const DetailedAgentListItem: React.FC<DetailedVariantProps> = ({
  agent,
  isMarketplacePublished = false,
  lastConversationTime,
  onClick,
  onEdit,
  onDelete,
  isDragging = false,
  dragHandleProps,
  style,
  setNodeRef,
}) => {
  const { t } = useTranslation();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    isLongPress.current = false;
    const touch = e.touches[0];
    const { clientX, clientY } = touch;

    longPressTimer.current = setTimeout(() => {
      setContextMenu({ x: clientX, y: clientY });
      // Haptic feedback (best-effort)
      try {
        if ("vibrate" in navigator) {
          navigator.vibrate(10);
        }
      } catch {
        // ignore
      }
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const handleTouchMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Check if it's a default agent based on tags
  const isDefaultAgent = agent.tags?.some((tag) => tag.startsWith("default_"));

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  // When sortable (dragHandleProps provided), use simple div to avoid motion conflicts
  if (dragHandleProps) {
    return (
      <>
        <div
          ref={setNodeRef}
          style={style}
          onClick={() => {
            if (isLongPress.current || isDragging) return;
            onClick?.(agent);
          }}
          onContextMenu={handleContextMenu}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchMove}
          className={`
            group relative flex cursor-pointer items-start gap-4 rounded-sm border p-3
            border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/60
            ${agent.id === "default-chat" ? "select-none" : ""}
            ${isDragging ? "shadow-xl z-50 cursor-grabbing" : ""}
          `}
          {...dragHandleProps.attributes}
          {...dragHandleProps.listeners}
        >
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
        </div>

        {/* Context menu */}
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
      <motion.div
        layout={!isDragging}
        variants={itemVariants}
        whileHover={
          isDragging
            ? undefined
            : { scale: 1.02, transition: { duration: 0.2 } }
        }
        whileTap={isDragging ? undefined : { scale: 0.98 }}
        onClick={() => {
          if (isLongPress.current || isDragging) return;
          onClick?.(agent);
        }}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        className={`
            group relative flex cursor-pointer items-start gap-4 rounded-sm border p-3
            border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/60
            ${agent.id === "default-chat" ? "select-none" : ""}
            ${isDragging ? "shadow-xl z-50 cursor-grabbing" : ""}
          `}
      >
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
                      <motion.div
                        whileHover={{
                          rotate: [0, -15, 15, -15, 15, 0],
                          scale: 1.2,
                          transition: { duration: 0.5, ease: "easeInOut" },
                        }}
                      >
                        <ShoppingBagIcon className="h-3.5 w-3.5" />
                      </motion.div>
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
      </motion.div>

      {/* Context menu - rendered via portal to escape overflow:hidden containers */}
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
  dragHandleProps,
  style,
  setNodeRef,
}) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  // Check if it's a default agent based on tags
  const isDefaultAgent = agent.tags?.some((tag) => tag.startsWith("default_"));

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onEdit && !onDelete) return; // No context menu if no handlers
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!onEdit && !onDelete) return;
    isLongPress.current = false;
    const touch = e.touches[0];
    const { clientX, clientY } = touch;

    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setContextMenu({ x: clientX, y: clientY });
      try {
        if ("vibrate" in navigator) {
          navigator.vibrate(10);
        }
      } catch {
        // ignore
      }
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const handleTouchMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
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
          if (isLongPress.current || isDragging) return;
          onClick?.(agent);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!isLongPress.current && !isDragging) {
              onClick?.(agent);
            }
          }
        }}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 group ${
          isSelected
            ? "bg-white/80 dark:bg-white/20 shadow-sm"
            : "hover:bg-white/40 dark:hover:bg-white/10"
        } ${isDragging ? "shadow-xl z-50 cursor-grabbing" : "cursor-pointer"}`}
        {...dragHandleProps?.attributes}
        {...dragHandleProps?.listeners}
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
          {status === "busy" && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500"></span>
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            {agent.name}
          </div>
          {role && (
            <div className="truncate text-[10px] text-neutral-500">{role}</div>
          )}
        </div>
      </div>

      {/* Context menu - rendered via portal to escape overflow:hidden containers */}
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
