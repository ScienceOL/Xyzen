"use client";

import ChatStatusBadge from "@/components/base/ChatStatusBadge";
import type { Agent } from "@/types/agents";
import { Crown, PencilIcon, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

// Swipe constants (edit-only: single button)
const SWIPE_THRESHOLD = 45;
const ACTION_WIDTH = 56; // 36px button + 12px right pad + 8px gap

interface CeoAgentCardProps {
  agent: Agent;
  isLoading?: boolean;
  activeTopicCount?: number;
  onClick?: (agent: Agent) => void;
  onEdit?: (agent: Agent) => void;
  onAutoExploreToggle?: (enabled: boolean) => void;
  autoExploreLoading?: boolean;
}

/**
 * Inline SVG pattern — Art Deco fan motif rendered at very low opacity
 * as a luxury background texture. Encoded as a data URI so no extra
 * network request is needed.
 */
const patternUrl = `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cpath d='M30 0c0 16.569-13.431 30-30 30C16.569 30 30 16.569 30 0z' fill='%23fff' fill-opacity='.04'/%3E%3Cpath d='M60 0c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23fff' fill-opacity='.04'/%3E%3Cpath d='M30 30c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23fff' fill-opacity='.04'/%3E%3Cpath d='M60 30c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23fff' fill-opacity='.04'/%3E%3C/g%3E%3C/svg%3E")`;

const CeoAgentCard: React.FC<CeoAgentCardProps> = ({
  agent,
  isLoading = false,
  activeTopicCount = 0,
  onClick,
  onEdit,
  onAutoExploreToggle,
  autoExploreLoading = false,
}) => {
  const { t } = useTranslation();

  // ---- Swipe state ----
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiped, setIsSwiped] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeStartOffset = useRef(0);
  const isSwipingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentElRef = useRef<HTMLDivElement>(null);

  // Close swipe on outside click
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

  // Non-passive touchmove for preventDefault during horizontal swipe
  useEffect(() => {
    const el = contentElRef.current;
    if (!el) return;

    const onTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
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

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      swipeStartOffset.current = swipeOffset;
      isSwipingRef.current = false;
    },
    [swipeOffset],
  );

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current) return;
    if (swipeOffset < -SWIPE_THRESHOLD) {
      setSwipeOffset(-ACTION_WIDTH);
      setIsSwiped(true);
    } else {
      setSwipeOffset(0);
      setIsSwiped(false);
    }
    touchStartRef.current = null;
    isSwipingRef.current = false;
  }, [swipeOffset]);

  const handleClick = useCallback(() => {
    if (isSwiped) {
      setIsSwiped(false);
      setSwipeOffset(0);
      return;
    }
    onClick?.(agent);
  }, [isSwiped, onClick, agent]);

  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsSwiped(false);
      setSwipeOffset(0);
      onEdit?.(agent);
    },
    [onEdit, agent],
  );

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-2xl">
      {/* Swipe action — amber edit button */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-end pr-3">
        <button
          onClick={handleEditClick}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-600 active:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:active:bg-amber-800/50"
        >
          <PencilIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Main card content — slides left on swipe */}
      <motion.div
        ref={contentElRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        animate={{ x: swipeOffset }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        whileTap={swipeOffset === 0 ? { scale: 0.98 } : undefined}
        onClick={handleClick}
        className={`
          group relative cursor-pointer overflow-hidden rounded-2xl
          bg-white/60 dark:bg-neutral-900/60
          backdrop-blur-2xl
          shadow-[0_2px_16px_rgba(0,0,0,0.08)]
          dark:shadow-[0_2px_16px_rgba(0,0,0,0.3)]
          p-4
          ${isLoading ? "animate-pulse" : ""}
        `}
        style={{
          border: "1px solid transparent",
          backgroundClip: "padding-box",
          backgroundOrigin: "border-box",
        }}
      >
        {/* Amber gradient border */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-amber-400/25 dark:ring-amber-500/20" />
        <div className="pointer-events-none absolute inset-0 rounded-2xl border border-amber-300/30 dark:border-amber-500/15" />
        {/* Decorative pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-30 dark:opacity-100"
          style={{ backgroundImage: patternUrl, backgroundSize: "60px 60px" }}
        />
        {/* Subtle top-right radial glow */}
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-400/[0.06] dark:bg-amber-400/[0.04]" />
        {/* Thin gold accent line at top */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />

        {/* Top-right action badges */}
        <div
          className="absolute right-3 top-3 z-20 flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Edit button — hover reveal */}
          {onEdit && (
            <button
              onClick={handleEditClick}
              className="rounded-full bg-white/50 p-1 text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white hover:text-amber-600 active:bg-amber-50 dark:bg-black/20 dark:text-neutral-500 dark:hover:bg-black/40 dark:hover:text-amber-400"
            >
              <PencilIcon className="h-3 w-3" />
            </button>
          )}
          {/* Auto-explore badge — always visible */}
          {onAutoExploreToggle && (
            <button
              title={t("agents.rootAgent.autoExploreHint")}
              onClick={() =>
                !autoExploreLoading &&
                onAutoExploreToggle(!(agent.auto_explore_enabled ?? false))
              }
              disabled={autoExploreLoading}
              className={`
                rounded-full p-1 transition-all duration-300
                ${autoExploreLoading ? "cursor-not-allowed opacity-40" : "cursor-pointer"}
                ${
                  agent.auto_explore_enabled
                    ? "bg-amber-400/20 text-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.25)] dark:bg-amber-500/15 dark:text-amber-400 dark:shadow-[0_0_6px_rgba(245,158,11,0.15)]"
                    : "bg-neutral-100/60 text-neutral-300 dark:bg-white/[0.04] dark:text-neutral-600"
                }
              `}
            >
              <Sparkles className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="relative flex items-center gap-3.5">
          {/* Avatar — always use dicebear with seed=ceo */}
          <div className="relative shrink-0">
            <div className="h-11 w-11 overflow-hidden rounded-full ring-1 ring-amber-300/30 dark:ring-amber-500/20">
              <img
                src={
                  agent.avatar ||
                  "https://api.dicebear.com/7.x/avataaars/svg?seed=default"
                }
                alt={agent.name}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-amber-500 ring-[1.5px] ring-white/80 dark:ring-neutral-900/80">
              <Crown className="h-2.5 w-2.5 text-white" />
            </div>
          </div>

          {/* Content */}
          <div className="flex flex-1 flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                {agent.name}
              </span>
              <span className="shrink-0 rounded-sm bg-amber-500/10 px-1.5 py-px text-[9px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
                {t("agents.rootAgent.badge")}
              </span>
              {activeTopicCount > 0 && (
                <ChatStatusBadge
                  status="running"
                  size="xs"
                  className="shrink-0"
                />
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-1">
              {agent.description ||
                t("agents.rootAgent.description", {
                  defaultValue: "No need to overthink — just chat with me",
                })}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default React.memo(CeoAgentCard);
