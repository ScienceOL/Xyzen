import { motion } from "framer-motion";

interface LoadingMessageProps {
  size?: "small" | "medium" | "large";
  className?: string;
}

export default function LoadingMessage({
  size = "small",
  className = "",
}: LoadingMessageProps) {
  const sizeToDot = {
    small: "h-0.5 w-0.5",
    medium: "h-2 w-2",
    large: "h-3 w-3",
  } as const;

  const sizeToGap = {
    small: "space-x-1",
    medium: "space-x-1.5",
    large: "space-x-2",
  } as const;

  const dotSizeClass = sizeToDot[size] ?? sizeToDot.small;
  const gapClass = sizeToGap[size] ?? sizeToGap.small;

  const pulseScale = size === "large" ? [1, 1.1, 1] : [1, 1.2, 1];

  return (
    <div className={`flex items-center ${className}`}>
      <motion.div
        className={`flex ${gapClass}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className={`${dotSizeClass} rounded-full bg-neutral-500 dark:bg-neutral-400`}
          animate={{
            scale: pulseScale,
            opacity: [0.7, 1, 0.7],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: 0,
          }}
        />
        <motion.div
          className={`${dotSizeClass} rounded-full bg-neutral-500 dark:bg-neutral-400`}
          animate={{
            scale: pulseScale,
            opacity: [0.7, 1, 0.7],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: 0.3,
          }}
        />
        <motion.div
          className={`${dotSizeClass} rounded-full bg-neutral-500 dark:bg-neutral-400`}
          animate={{
            scale: pulseScale,
            opacity: [0.7, 1, 0.7],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: 0.6,
          }}
        />
      </motion.div>
    </div>
  );
}
