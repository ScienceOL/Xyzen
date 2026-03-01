import { motion, AnimatePresence, useInView } from "motion/react";
import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type WheelEvent as ReactWheelEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Play } from "lucide-react";

/* ================================================================== */
/*  Capability data — richer descriptions                               */
/* ================================================================== */

interface Capability {
  key: string;
  icon: string;
  title: string;
  desc: string;
  accent: string;
}

const CAPABILITY_STATIC = [
  { key: "autonomous", icon: "\u{1F52E}", accent: "#8B5CF6" },
  { key: "team", icon: "\u{1F91D}", accent: "#3B82F6" },
  { key: "sandbox", icon: "\u{1F6E0}\uFE0F", accent: "#F59E0B" },
  { key: "skills", icon: "\u26A1", accent: "#FB923C" },
  { key: "memory", icon: "\u{1F9E0}", accent: "#EC4899" },
  { key: "knowledge", icon: "\u{1F4DA}", accent: "#06B6D4" },
  { key: "multimodal", icon: "\u{1F5BC}\uFE0F", accent: "#14B8A6" },
  { key: "mcp", icon: "\u{1F50C}", accent: "#A78BFA" },
  { key: "scheduled_tasks", icon: "\u23F0", accent: "#10B981" },
  { key: "agent_create_agent", icon: "\u{1F9EC}", accent: "#F43F5E" },
  { key: "deploy", icon: "\u{1F680}", accent: "#6366F1" },
] as const;

const TOTAL = CAPABILITY_STATIC.length;

/* ================================================================== */
/*  Slot card — single item in the vertical carousel                    */
/* ================================================================== */

function SlotCard({
  capability,
  isActive,
  onClick,
}: {
  capability: Capability;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative w-full overflow-hidden rounded-xl text-left transition-colors duration-300 ${
        isActive ? "bg-white/[0.08]" : "bg-white/[0.02] hover:bg-white/[0.05]"
      }`}
      style={{
        border: isActive
          ? `1px solid ${capability.accent}40`
          : "1px solid rgba(255,255,255,0.03)",
        boxShadow: isActive
          ? `0 0 28px ${capability.accent}18, inset 0 1px 0 rgba(255,255,255,0.06)`
          : "none",
      }}
    >
      {isActive && (
        <div
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${capability.accent}80, transparent)`,
          }}
        />
      )}

      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: `${capability.accent}${isActive ? "20" : "10"}`,
          }}
        >
          <span className="text-lg">{capability.icon}</span>
        </div>
        <span
          className={`text-[13px] font-semibold leading-tight transition-colors duration-300 ${
            isActive ? "text-neutral-100" : "text-neutral-500"
          }`}
        >
          {capability.title}
        </span>
      </div>
    </button>
  );
}

/* ================================================================== */
/*  Vertical slot-machine carousel — tall, shows many items             */
/* ================================================================== */

const SLOT_HEIGHT = 64;
const VISIBLE_RANGE = 4;

function SlotCarousel({
  activeIndex,
  onSelect,
  onAdvance,
  capabilities,
}: {
  activeIndex: number;
  onSelect: (index: number) => void;
  onAdvance: (delta: number) => void;
  capabilities: Capability[];
}) {
  /* ── Wheel scroll — debounced to one step per gesture ── */
  const wheelCooldown = useRef(false);

  const handleWheel = useCallback(
    (e: ReactWheelEvent) => {
      if (wheelCooldown.current) return;
      const delta = e.deltaY;
      if (Math.abs(delta) < 10) return;
      wheelCooldown.current = true;
      onAdvance(delta > 0 ? 1 : -1);
      setTimeout(() => {
        wheelCooldown.current = false;
      }, 300);
    },
    [onAdvance],
  );

  /* ── Touch swipe — vertical drag ── */
  const touchStartY = useRef(0);

  const handleTouchStart = useCallback((e: ReactTouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: ReactTouchEvent) => {
      const dy = touchStartY.current - e.changedTouches[0].clientY;
      if (Math.abs(dy) < 30) return;
      onAdvance(dy > 0 ? 1 : -1);
    },
    [onAdvance],
  );

  return (
    <div
      className="relative w-[195px]"
      style={{
        height: (VISIBLE_RANGE * 2 + 1) * SLOT_HEIGHT,
        maskImage:
          "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
      }}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {capabilities.map((cap, i) => {
        let offset = i - activeIndex;
        if (offset > TOTAL / 2) offset -= TOTAL;
        if (offset < -TOTAL / 2) offset += TOTAL;

        const isActive = offset === 0;
        const absOffset = Math.abs(offset);
        const isVisible = absOffset <= VISIBLE_RANGE;

        return (
          <motion.div
            key={cap.key}
            animate={{
              y: offset * SLOT_HEIGHT,
              scale: isVisible ? (isActive ? 1 : 1 - absOffset * 0.04) : 0.8,
              opacity: isVisible ? (isActive ? 1 : 1 - absOffset * 0.2) : 0,
            }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className="absolute left-0 top-1/2 w-full -translate-y-1/2"
            style={{
              zIndex: 10 - absOffset,
              pointerEvents: isVisible ? "auto" : "none",
            }}
          >
            <SlotCard
              capability={cap}
              isActive={isActive}
              onClick={() => onSelect(i)}
            />
          </motion.div>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/*  Main component — full-bleed, floating overlays                      */
/* ================================================================== */

export function AgentCapabilities() {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: true, margin: "-80px" });
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const capabilities: Capability[] = useMemo(
    () =>
      CAPABILITY_STATIC.map((s) => ({
        key: s.key,
        icon: s.icon,
        accent: s.accent,
        title: t(`landing.v2.capabilities.items.${s.key}.title`),
        desc: t(`landing.v2.capabilities.items.${s.key}.desc`),
      })),
    [t],
  );

  const activeCap = capabilities[activeIndex];

  const startAutoPlay = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % TOTAL);
    }, 4000);
  }, []);

  useEffect(() => {
    if (!inView) return;
    const delay = setTimeout(() => {
      setStarted(true);
      startAutoPlay();
    }, 2000);
    return () => {
      clearTimeout(delay);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);

  const handleSelect = useCallback(
    (index: number) => {
      setActiveIndex(index);
      startAutoPlay();
    },
    [startAutoPlay],
  );

  const handleAdvance = useCallback(
    (delta: number) => {
      setActiveIndex((prev) => (prev + delta + TOTAL) % TOTAL);
      startAutoPlay();
    },
    [startAutoPlay],
  );

  return (
    <section
      id="agent-capabilities"
      ref={sectionRef}
      className="relative overflow-hidden"
    >
      {/* Top divider */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
      {/* Top/bottom fade — blends with adjacent sections */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60" />

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  TITLE — normal flow, top of section, NOT on the video      */}
      {/* ════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="relative z-10 px-6 pt-20 text-center md:pt-28"
      >
        <span className="mb-4 inline-block rounded-full border border-violet-500/20 bg-violet-500/[0.06] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[3px] text-violet-400 backdrop-blur-sm">
          {t("landing.v2.capabilities.badge")}
        </span>
        <h2 className="mb-3 text-3xl font-extrabold tracking-tight md:text-5xl">
          <span className="bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
            {t("landing.v2.capabilities.title1")}
          </span>
          <br />
          <span className="bg-gradient-to-r from-violet-300 to-rose-300 bg-clip-text text-transparent">
            {t("landing.v2.capabilities.title2")}
          </span>
        </h2>
        <p className="mx-auto max-w-lg text-[14px] text-neutral-500 md:text-[15px]">
          {t("landing.v2.capabilities.subtitle")}
        </p>
      </motion.div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  STAGE — video + slot + info, slight overlap with title     */}
      {/* ════════════════════════════════════════════════════════════ */}
      <div className="relative mx-auto -mt-6 min-h-[60vh] max-w-7xl px-6 pb-10 md:-mt-8 md:min-h-[70vh] md:pb-16">
        {/* ── VIDEO / DEMO — fills the stage ── */}
        <div className="absolute inset-x-6 bottom-10 top-0 overflow-hidden rounded-2xl border border-white/[0.04] bg-black md:bottom-16 md:left-[260px] md:right-6 lg:left-[280px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="absolute inset-0 flex items-center justify-center"
            >
              {/* Accent gradient wash */}
              <div
                className="pointer-events-none absolute inset-0 transition-all duration-700"
                style={{
                  background: `radial-gradient(ellipse at 40% 40%, ${activeCap.accent}0C, transparent 65%)`,
                }}
              />

              {/* Subtle grid */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.025]"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)",
                  backgroundSize: "48px 48px",
                }}
              />

              {/* Play button */}
              <div className="relative flex flex-col items-center gap-4">
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-white/[0.06] backdrop-blur-sm md:h-20 md:w-20"
                  style={{
                    boxShadow: `0 0 50px ${activeCap.accent}30, 0 0 100px ${activeCap.accent}10`,
                    border: `1px solid ${activeCap.accent}25`,
                  }}
                >
                  <Play className="ml-1 h-7 w-7 text-neutral-400 md:h-8 md:w-8" />
                </motion.div>
                <span className="text-[12px] text-neutral-600">
                  {t("landing.v2.capabilities.demoComingSoon")}
                </span>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── FLOATING: Slot carousel — left, full height ── */}
        <div className="pointer-events-auto absolute bottom-16 left-6 top-0 z-10 hidden w-[230px] items-center md:flex lg:w-[250px]">
          <SlotCarousel
            activeIndex={activeIndex}
            onSelect={handleSelect}
            onAdvance={handleAdvance}
            capabilities={capabilities}
          />
        </div>

        {/* ── FLOATING: Caption overlay — bottom, like movie poster subtitles ── */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 md:left-[260px] lg:left-[280px]">
          {/* Gradient fade — transparent → dark, gives text readability */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.4) 30%, rgba(0,0,0,0.85) 70%, rgba(0,0,0,0.95) 100%)",
            }}
          />

          <div className="relative px-8 pb-10 pt-24 md:px-10 md:pb-16 md:pt-32">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeIndex}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <div className="mb-2 flex items-center gap-3">
                  <span className="text-2xl">{activeCap.icon}</span>
                  <h3 className="text-xl font-bold tracking-tight text-white md:text-2xl">
                    {activeCap.title}
                  </h3>
                </div>
                <p className="max-w-2xl text-[13px] leading-relaxed text-neutral-400 md:text-[15px] md:leading-relaxed">
                  {activeCap.desc}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Progress bar + counter */}
            <div className="mt-5 flex items-center gap-4">
              <div className="h-[2px] flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                {started && (
                  <motion.div
                    key={activeIndex}
                    className="h-full rounded-full"
                    style={{ background: activeCap.accent }}
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 4, ease: "linear" }}
                  />
                )}
              </div>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-neutral-500">
                {String(activeIndex + 1).padStart(2, "0")} /{" "}
                {String(TOTAL).padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>

        {/* ── MOBILE: dot navigation ── */}
        <div className="absolute bottom-3 left-0 right-0 z-20 flex items-center justify-center gap-1.5 md:hidden">
          {CAPABILITY_STATIC.map((cap, i) => (
            <button
              key={cap.key}
              onClick={() => handleSelect(i)}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === activeIndex ? 18 : 5,
                background:
                  i === activeIndex
                    ? activeCap.accent
                    : "rgba(255,255,255,0.12)",
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
