"use client";

import { useState, useRef } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { Button, Group, Label, NumberField } from "react-aria-components";

const InputWithPlusMinusButtonsDemo = () => {
  const [value, setValue] = useState(1024);
  const directionRef = useRef<1 | -1>(1);

  const handleChange = (newValue: number) => {
    directionRef.current = newValue > value ? 1 : -1;
    setValue(newValue);
  };

  const digits = String(value);

  return (
    <NumberField
      value={value}
      onChange={handleChange}
      minValue={0}
      className="w-full max-w-xs space-y-2"
    >
      <Label className="flex items-center gap-2 text-sm leading-none font-medium select-none">
        Input with plus/minus buttons
      </Label>
      <Group className="dark:bg-input/30 border-input data-focus-within:border-ring data-focus-within:ring-ring/50 data-focus-within:has-aria-invalid:ring-destructive/20 dark:data-focus-within:has-aria-invalid:ring-destructive/40 data-focus-within:has-aria-invalid:border-destructive relative inline-flex h-9 w-full min-w-0 items-center overflow-hidden rounded-md border bg-transparent text-base whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-focus-within:ring-[3px] md:text-sm">
        <Button
          slot="decrement"
          className="border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground -ms-px flex aspect-square h-[inherit] items-center justify-center rounded-l-md border text-sm transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MinusIcon />
          <span className="sr-only">Decrement</span>
        </Button>
        <div className="relative flex w-full grow items-center justify-center overflow-hidden px-3 py-2">
          <div className="flex items-center tabular-nums">
            <AnimatePresence mode="popLayout" initial={false}>
              {digits.split("").map((digit, i) => (
                <motion.span
                  key={`${i}-${digit}`}
                  initial={{ y: directionRef.current * 16, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: directionRef.current * -16, opacity: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 30,
                    mass: 0.5,
                  }}
                  className="inline-block"
                >
                  {digit}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>
        <Button
          slot="increment"
          className="border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground -me-px flex aspect-square h-[inherit] items-center justify-center rounded-r-md border text-sm transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon />
          <span className="sr-only">Increment</span>
        </Button>
      </Group>
      <p className="text-muted-foreground text-xs">
        Built with{" "}
        <a
          className="hover:text-foreground underline"
          href="https://react-spectrum.adobe.com/react-aria/NumberField.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          React Aria
        </a>
      </p>
    </NumberField>
  );
};

export default InputWithPlusMinusButtonsDemo;
