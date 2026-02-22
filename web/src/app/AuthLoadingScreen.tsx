import { Progress } from "@/components/animate-ui/components/radix/progress";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const TIP_KEYS = [
  "noAds",
  "ceoAgent",
  "publishEarn",
  "lazyProductivity",
  "deadlineProductivity",
  "worthyOpponent",
  "knowledgeBase",
  "multiAgent",
  "dailyCheckIn",
] as const;

/** Shuffle an array (Fisher-Yates) and return a new copy. */
function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function FlipText() {
  const { t } = useTranslation();

  // Build a shuffled order once on mount so users see variety without repeats.
  const order = useMemo(() => shuffle(TIP_KEYS), []);

  const tips = useMemo(
    () => order.map((key) => t(`app.loading.tips.${key}`)),
    [order, t],
  );

  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % tips.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [tips.length]);

  const text = tips[index];

  return (
    <div className="relative flex h-8 w-full items-center justify-center overflow-hidden">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={index}
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: { staggerChildren: 0.05 },
            },
            exit: {
              opacity: 0,
              transition: { staggerChildren: 0.02, staggerDirection: -1 },
            },
          }}
          className="absolute flex w-full justify-center"
        >
          {text.split("").map((char, i) => (
            <motion.span
              key={i}
              variants={{
                hidden: {
                  y: 20,
                  opacity: 0,
                  rotateX: -90,
                  filter: "blur(10px)",
                },
                visible: {
                  y: 0,
                  opacity: 1,
                  rotateX: 0,
                  filter: "blur(0px)",
                  transition: {
                    type: "spring",
                    damping: 12,
                    stiffness: 200,
                  },
                },
                exit: {
                  y: -20,
                  opacity: 0,
                  rotateX: 90,
                  filter: "blur(10px)",
                },
              }}
              className={cn(
                "inline-block text-sm font-medium text-muted-foreground",
              )}
              style={{ perspective: "1000px" }}
            >
              {char === " " ? "\u00A0" : char}
            </motion.span>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function AuthLoadingScreen({ progress }: { progress: number }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <FlipText />
      <Progress value={progress} className="w-56" />
    </div>
  );
}
