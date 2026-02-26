"use client";

import { Field } from "@headlessui/react";
import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * FieldGroup — standard form-field wrapper with consistent spacing.
 *
 * Layout:
 *   label          (text-[13px] font-medium)
 *        ↕ gap-2
 *   input / control
 *        ↕ gap-1.5
 *   hint / caption  (text-xs text-neutral-400)
 */

interface FieldGroupProps {
  /** The label text (rendered inside a styled <label>) */
  label?: ReactNode;
  /** Extra element rendered to the right of the label (e.g., icon button) */
  labelExtra?: ReactNode;
  /** Whether the field is required — shows a red asterisk */
  required?: boolean;
  /** Hint / helper text below the input */
  hint?: ReactNode;
  /** The input or control element */
  children: ReactNode;
  className?: string;
}

export function FieldGroup({
  label,
  labelExtra,
  required,
  hint,
  children,
  className,
}: FieldGroupProps) {
  return (
    <Field className={clsx("flex flex-col", className)}>
      {label && (
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
            {label}
            {required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
          {labelExtra}
        </div>
      )}
      {children}
      {hint && (
        <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
          {hint}
        </p>
      )}
    </Field>
  );
}
