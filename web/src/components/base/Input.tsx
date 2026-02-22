"use client";

import {
  Input as HeadlessInput,
  type InputProps as HeadlessInputProps,
} from "@headlessui/react";
import clsx from "clsx";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { useCallback, useRef, useState } from "react";

/**
 * Modern flat input with animated focus border.
 *
 * - Idle: 1px neutral border
 * - Focus: border color transitions to indigo with a subtle spring scale-in
 * - The wrapper uses `motion.div` so the border "grows" smoothly via
 *   framer-motion rather than a CSS transition (feels crisper).
 */

const BASE =
  "relative flex items-center rounded-sm transition-shadow duration-200";

const BORDER_IDLE = "ring-1 ring-neutral-200 dark:ring-neutral-700/80";
const BORDER_FOCUS =
  "ring-[1.5px] ring-indigo-500 dark:ring-indigo-400 shadow-[0_0_0_3px_rgba(99,102,241,0.08)] dark:shadow-[0_0_0_3px_rgba(129,140,248,0.1)]";

const INPUT_BASE =
  "block w-full appearance-none border-0 bg-transparent px-3.5 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100 dark:placeholder:text-neutral-500";

export type InputProps = {
  className?: string;
  wrapperClassName?: string;
} & HeadlessInputProps;

export function Input({
  className,
  wrapperClassName,
  onFocus,
  onBlur,
  ...props
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Motion progress: 0 → 1 on focus
  const progress = useMotionValue(focused ? 1 : 0);
  const scale = useTransform(progress, [0, 1], [0.998, 1]);

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(true);
      progress.set(1);
      onFocus?.(e as never);
    },
    [onFocus, progress],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(false);
      progress.set(0);
      onBlur?.(e as never);
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
      <HeadlessInput
        ref={inputRef}
        autoComplete="off"
        className={clsx(INPUT_BASE, "rounded-sm", className)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
    </motion.div>
  );
}
