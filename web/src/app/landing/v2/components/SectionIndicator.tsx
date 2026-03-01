import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";

/* ------------------------------------------------------------------ */
/*  Content sections (Hero excluded — it uses a separate triangle)     */
/* ------------------------------------------------------------------ */
const SECTIONS = [
  { id: "autonomous-exploration", i18nKey: "exploration" },
  { id: "agent-economy", i18nKey: "economy" },
  { id: "agent-capabilities", i18nKey: "capabilities" },
  { id: "open-source", i18nKey: "openSource" },
] as const;

/* ------------------------------------------------------------------ */
/*  Hero triangle — SVG with stroke-draw animation on click            */
/* ------------------------------------------------------------------ */
// Triangle: 12×10, vertices (6,0.5) (11.5,9.5) (0.5,9.5)
// Perimeter ≈ 10.3 + 11 + 10.3 ≈ 31.6
const TRI_D = "M 6 0.5 L 11.5 9.5 L 0.5 9.5 Z";
const TRI_PERIM = 32;

function HeroTriangle({ isActive }: { isActive: boolean }) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = useCallback(() => {
    setIsDrawing(true);
    document.getElementById("hero")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="mb-1 flex items-center justify-start"
    >
      <motion.svg
        width={12}
        height={10}
        viewBox="0 0 12 10"
        className="overflow-visible"
        animate={{ scale: isHovered ? 1.25 : 1 }}
        transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
      >
        {/* Base outline — active / hovered / idle */}
        <motion.path
          d={TRI_D}
          fill="none"
          stroke="white"
          strokeLinejoin="round"
          animate={{
            strokeWidth: isActive || isHovered ? 1.5 : 1.2,
            opacity: isActive ? 0.75 : isHovered ? 0.5 : 0.2,
          }}
          transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
        />

        {/* Animated trace — on click */}
        <AnimatePresence>
          {isDrawing && (
            <motion.path
              d={TRI_D}
              fill="none"
              stroke="white"
              strokeWidth={1.5}
              strokeLinejoin="round"
              initial={{
                strokeDasharray: TRI_PERIM,
                strokeDashoffset: TRI_PERIM,
                opacity: 0.9,
              }}
              animate={{
                strokeDashoffset: 0,
                opacity: 0.9,
              }}
              exit={{ opacity: 0 }}
              transition={{
                strokeDashoffset: {
                  duration: 0.55,
                  ease: [0.16, 1, 0.3, 1],
                },
                opacity: { duration: 0.3 },
              }}
              onAnimationComplete={() => setIsDrawing(false)}
            />
          )}
        </AnimatePresence>
      </motion.svg>
    </button>
  );
}

/* ================================================================== */
/*  SectionIndicator — fixed left-side scroll position tracker         */
/* ================================================================== */
export function SectionIndicator() {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string | null>("hero");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  /* ── IntersectionObserver — detect which content section is in view ── */
  useEffect(() => {
    const visibleMap = new Map<string, boolean>();

    const ALL_IDS = ["hero", ...SECTIONS.map((s) => s.id)];

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibleMap.set(entry.target.id, entry.isIntersecting);
        }
        for (const id of ALL_IDS) {
          if (visibleMap.get(id)) {
            setActiveId(id);
            return;
          }
        }
        setActiveId(null);
      },
      { rootMargin: "-35% 0px -35% 0px" },
    );

    for (const id of ALL_IDS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <nav className="fixed left-5 top-1/2 z-50 hidden -translate-y-1/2 flex-col gap-4 lg:flex xl:left-7">
      {/* ── Hero — triangle, no label ── */}
      <HeroTriangle isActive={activeId === "hero"} />

      {/* ── Content sections — label above, line below ── */}
      {SECTIONS.map(({ id, i18nKey }) => {
        const isActive = activeId === id;
        const isHovered = hoveredId === id;
        const expanded = isActive || isHovered;

        return (
          <button
            key={id}
            onClick={() => scrollTo(id)}
            onMouseEnter={() => setHoveredId(id)}
            onMouseLeave={() => setHoveredId(null)}
            className="flex flex-col items-start gap-1.5"
          >
            {/* ── Label (above) ── */}
            <motion.span
              className="pointer-events-none whitespace-nowrap text-[11px] font-medium text-white"
              animate={{
                opacity: expanded ? (isActive ? 0.7 : 0.4) : 0,
                y: expanded ? 0 : 4,
              }}
              transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
            >
              {t(`landing.v2.sectionNav.${i18nKey}`)}
            </motion.span>

            {/* ── Line (below) ── */}
            <motion.div
              className="rounded-full bg-white"
              animate={{
                width: isActive ? 28 : isHovered ? 20 : 14,
                height: isActive ? 2 : 1.5,
                opacity: isActive ? 0.8 : isHovered ? 0.45 : 0.18,
              }}
              transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
            />
          </button>
        );
      })}
    </nav>
  );
}
