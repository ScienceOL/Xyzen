import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MinusIcon, PlusIcon } from "lucide-react";
import {
  Button as AriaButton,
  Group as AriaGroup,
  Input as AriaInput,
  NumberField,
} from "react-aria-components";

interface StepperInputProps {
  value: number;
  onChange: (value: number) => void;
  minValue?: number;
  maxValue?: number;
  step?: number;
  className?: string;
}

export function StepperInput({
  value,
  onChange,
  minValue,
  maxValue,
  step = 1,
  className,
}: StepperInputProps) {
  const prevValueRef = useRef(value);
  const directionRef = useRef<1 | -1>(1);

  const handleChange = (newValue: number) => {
    directionRef.current = newValue >= prevValueRef.current ? 1 : -1;
    prevValueRef.current = newValue;
    onChange(newValue);
  };

  return (
    <NumberField
      value={value}
      onChange={handleChange}
      minValue={minValue}
      maxValue={maxValue}
      step={step}
      className={className}
    >
      <AriaGroup className="border-input data-focus-within:border-ring data-focus-within:ring-ring/50 relative inline-flex h-9 w-full min-w-0 items-center overflow-hidden rounded-md border bg-transparent text-base whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-focus-within:ring-[3px] dark:bg-neutral-800/30 md:text-sm">
        <AriaButton
          slot="decrement"
          className="border-input text-muted-foreground hover:bg-accent hover:text-foreground -ms-px flex aspect-square h-[inherit] items-center justify-center rounded-l-md border bg-neutral-50 text-sm transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-800"
        >
          <MinusIcon size={14} />
        </AriaButton>
        <div className="relative flex w-full grow items-center justify-center overflow-hidden">
          <AriaInput className="absolute inset-0 z-10 h-full w-full px-3 py-2 text-center text-[13px] tabular-nums text-transparent caret-transparent outline-none" />
          <div className="pointer-events-none flex items-center justify-center px-3 py-2">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={value}
                initial={{
                  y: directionRef.current * 14,
                  opacity: 0,
                  filter: "blur(2px)",
                }}
                animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                exit={{
                  y: directionRef.current * -14,
                  opacity: 0,
                  filter: "blur(2px)",
                }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 15,
                  mass: 0.8,
                }}
                className="text-[13px] tabular-nums text-neutral-800 dark:text-neutral-200"
              >
                {value.toLocaleString()}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
        <AriaButton
          slot="increment"
          className="border-input text-muted-foreground hover:bg-accent hover:text-foreground -me-px flex aspect-square h-[inherit] items-center justify-center rounded-r-md border bg-neutral-50 text-sm transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-800"
        >
          <PlusIcon size={14} />
        </AriaButton>
      </AriaGroup>
    </NumberField>
  );
}
