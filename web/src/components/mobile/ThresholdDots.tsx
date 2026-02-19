import { type MotionValue, motion, useTransform } from "framer-motion";
import React from "react";

interface ThresholdDotsProps {
  progress: MotionValue<number>;
  direction: "up" | "down" | null;
}

const Dot: React.FC<{ progress: MotionValue<number>; threshold: number }> = ({
  progress,
  threshold,
}) => {
  const scale = useTransform(progress, [threshold, threshold + 0.15], [0, 1]);
  const opacity = useTransform(progress, [threshold, threshold + 0.15], [0, 1]);

  return (
    <motion.div
      style={{ scale, opacity }}
      className="h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-400"
    />
  );
};

const ThresholdDots: React.FC<ThresholdDotsProps> = ({
  progress,
  direction,
}) => {
  if (!direction) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 z-30 flex -translate-y-1/2 items-center justify-center gap-2">
      <Dot progress={progress} threshold={0} />
      <Dot progress={progress} threshold={0.3} />
      <Dot progress={progress} threshold={0.6} />
    </div>
  );
};

export default React.memo(ThresholdDots);
