"use client";

import clsx from "clsx";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/16/solid";
import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type InputHTMLAttributes,
} from "react";

/**
 * TagInput — chip/tag array editor matching Input.tsx visual style.
 *
 * - Idle: 1px neutral border (ring-1)
 * - Focus: indigo ring glow with spring scale-in
 * - Tags rendered as compact pills with remove button
 * - Enter or comma inserts a new tag, Backspace removes the last
 */

const BASE =
  "relative flex flex-wrap items-center gap-1 rounded-sm px-2 py-1.5 transition-shadow duration-200 min-h-[38px]";

const BORDER_IDLE = "ring-1 ring-neutral-200 dark:ring-neutral-700/80";
const BORDER_FOCUS =
  "ring-[1.5px] ring-indigo-500 dark:ring-indigo-400 shadow-[0_0_0_3px_rgba(99,102,241,0.08)] dark:shadow-[0_0_0_3px_rgba(129,140,248,0.1)]";

export interface TagInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> {
  value: string[];
  onChange: (tags: string[]) => void;
  wrapperClassName?: string;
}

export function TagInput({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  wrapperClassName,
  onFocus: onFocusProp,
  onBlur: onBlurProp,
  ...rest
}: TagInputProps) {
  const [focused, setFocused] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const progress = useMotionValue(focused ? 1 : 0);
  const scale = useTransform(progress, [0, 1], [0.998, 1]);

  const addTag = useCallback(
    (raw: string) => {
      const tag = raw.trim();
      if (tag && !value.includes(tag)) {
        onChange([...value, tag]);
      }
    },
    [value, onChange],
  );

  const removeTag = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        if (inputValue.trim()) {
          addTag(inputValue);
          setInputValue("");
        }
      } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
        removeTag(value.length - 1);
      }
    },
    [inputValue, value, addTag, removeTag],
  );

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(true);
      progress.set(1);
      onFocusProp?.(e);
    },
    [onFocusProp, progress],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      // Commit pending input on blur
      if (inputValue.trim()) {
        addTag(inputValue);
        setInputValue("");
      }
      setFocused(false);
      progress.set(0);
      onBlurProp?.(e);
    },
    [inputValue, addTag, onBlurProp, progress],
  );

  const handleWrapperClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <motion.div
      className={clsx(
        BASE,
        focused ? BORDER_FOCUS : BORDER_IDLE,
        disabled && "cursor-not-allowed opacity-50",
        "cursor-text",
        wrapperClassName,
      )}
      style={{ scale }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      onClick={handleWrapperClick}
    >
      {value.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="inline-flex items-center gap-0.5 rounded bg-neutral-100/60 px-1.5 py-0.5 text-xs text-neutral-700 dark:bg-white/[0.04] dark:text-neutral-300"
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(i);
              }}
              className="ml-0.5 rounded-sm p-0.5 hover:bg-neutral-200/80 dark:hover:bg-white/10"
            >
              <XMarkIcon className="h-3 w-3 text-neutral-400" />
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={value.length === 0 ? placeholder : undefined}
        disabled={disabled}
        className={clsx(
          "min-w-[60px] flex-1 border-0 bg-transparent p-1 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100 dark:placeholder:text-neutral-500",
          className,
        )}
        {...rest}
      />
    </motion.div>
  );
}
