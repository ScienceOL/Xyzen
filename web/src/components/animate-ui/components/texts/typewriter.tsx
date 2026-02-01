"use client";

import * as React from "react";
import { motion, type HTMLMotionProps, type Variants } from "motion/react";
import { cn } from "@/lib/utils";

type TypewriterProps = Omit<HTMLMotionProps<"span">, "children"> & {
  /** The text to display with typewriter effect */
  text: string;
  /** Delay before typing starts (in seconds) */
  delay?: number;
  /** Duration for each character to appear (in seconds) */
  speed?: number;
  /** Whether to show a blinking cursor */
  cursor?: boolean;
  /** Cursor character */
  cursorChar?: string;
  /** Callback when typing completes */
  onComplete?: () => void;
};

const cursorVariants: Variants = {
  blinking: {
    opacity: [1, 1, 0, 0],
    transition: {
      duration: 1,
      repeat: Infinity,
      repeatDelay: 0,
      ease: "linear",
      times: [0, 0.5, 0.5, 1],
    },
  },
};

function Typewriter({
  text,
  delay = 0,
  speed = 0.05,
  cursor = true,
  cursorChar = "|",
  onComplete,
  className,
  ...props
}: TypewriterProps) {
  const [displayedText, setDisplayedText] = React.useState("");
  const [, setIsComplete] = React.useState(false);
  const onCompleteRef = React.useRef(onComplete);

  // Keep onComplete ref updated to avoid dependency issues
  React.useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  React.useEffect(() => {
    // Reset state when text changes
    setDisplayedText("");
    setIsComplete(false);

    let timeoutId: NodeJS.Timeout;
    let currentIndex = 0;
    let isCancelled = false;

    const typeNextChar = () => {
      if (isCancelled) return;

      if (currentIndex < text.length) {
        setDisplayedText(text.slice(0, currentIndex + 1));
        currentIndex++;
        timeoutId = setTimeout(typeNextChar, speed * 1000);
      } else {
        setIsComplete(true);
        onCompleteRef.current?.();
      }
    };

    timeoutId = setTimeout(typeNextChar, delay * 1000);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [text, delay, speed]);

  return (
    <motion.span
      data-slot="typewriter"
      className={cn("inline-flex items-baseline", className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      {...props}
    >
      <span>{displayedText}</span>
      {cursor && (
        <motion.span
          data-slot="typewriter-cursor"
          variants={cursorVariants}
          animate="blinking"
          className={cn("ml-1 inline-block font-light", "opacity-100")}
          aria-hidden="true"
        >
          {cursorChar}
        </motion.span>
      )}
    </motion.span>
  );
}

export { Typewriter, type TypewriterProps };
