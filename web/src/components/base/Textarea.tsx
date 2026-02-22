"use client";

import clsx from "clsx";
import { motion, useMotionValue, useTransform } from "framer-motion";
import {
  useCallback,
  useRef,
  useState,
  type TextareaHTMLAttributes,
} from "react";

/**
 * Modern flat textarea with animated focus border.
 * Mirrors the Input component styling for visual consistency.
 */

const BASE = "relative flex rounded-sm transition-shadow duration-200";

const BORDER_IDLE = "ring-1 ring-neutral-200 dark:ring-neutral-700/80";
const BORDER_FOCUS =
  "ring-[1.5px] ring-indigo-500 dark:ring-indigo-400 shadow-[0_0_0_3px_rgba(99,102,241,0.08)] dark:shadow-[0_0_0_3px_rgba(129,140,248,0.1)]";

const TEXTAREA_BASE =
  "block w-full resize-none appearance-none border-0 bg-transparent px-3.5 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100 dark:placeholder:text-neutral-500";

export type TextareaProps = {
  className?: string;
  wrapperClassName?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({
  className,
  wrapperClassName,
  onFocus,
  onBlur,
  ...props
}: TextareaProps) {
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const progress = useMotionValue(focused ? 1 : 0);
  const scale = useTransform(progress, [0, 1], [0.998, 1]);

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      setFocused(true);
      progress.set(1);
      onFocus?.(e);
    },
    [onFocus, progress],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      setFocused(false);
      progress.set(0);
      onBlur?.(e);
    },
    [onBlur, progress],
  );

  return (
    <motion.div
      className={clsx(
        BASE,
        focused ? BORDER_FOCUS : BORDER_IDLE,
        wrapperClassName,
      )}
      style={{ scale }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
    >
      <textarea
        ref={textareaRef}
        className={clsx(TEXTAREA_BASE, "rounded-sm", className)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
    </motion.div>
  );
}
