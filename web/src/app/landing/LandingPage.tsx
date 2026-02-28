import { motion, useInView } from "motion/react";
import { useTranslation } from "react-i18next";
import { useRef } from "react";
import { Github, ArrowRight, ChevronDown, Scale, Shield } from "lucide-react";

const GITHUB_REPO_URL = "https://github.com/ScienceOL/Xyzen";

/* ------------------------------------------------------------------ */
/*  Watercolor palette — warm sunset tones inspired by the reference  */
/* ------------------------------------------------------------------ */
const WC = {
  peach: "rgba(255,183,130,0.12)",
  rose: "rgba(245,140,160,0.10)",
  lavender: "rgba(180,160,240,0.10)",
  gold: "rgba(255,210,100,0.08)",
  sky: "rgba(160,200,255,0.08)",
  ink: "rgba(60,40,80,0.06)",
};

/* ------------------------------------------------------------------ */
/*  Reusable: section wrapper with scroll-triggered fade-in           */
/* ------------------------------------------------------------------ */
function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <section
      ref={ref}
      id={id}
      className={`relative px-6 py-24 md:py-32 ${className}`}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto max-w-5xl"
      >
        {children}
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Reusable: section badge                                           */
/* ------------------------------------------------------------------ */
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-5 inline-block rounded-full border border-neutral-300/30 bg-white/40 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[3px] text-neutral-500 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400">
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Reusable: motion card with watercolor tint                        */
/* ------------------------------------------------------------------ */
function WatercolorCard({
  children,
  tint = WC.peach,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  tint?: string;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30, scale: 0.97 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{
        duration: 0.7,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={{ y: -4, transition: { duration: 0.25 } }}
      className={`rounded-lg p-6 backdrop-blur-sm ${className}`}
      style={{ background: tint }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Timeline dot                                                      */
/* ------------------------------------------------------------------ */
function TimelineDot({ active = false }: { active?: boolean }) {
  return (
    <div
      className={`absolute -left-[25px] top-1.5 h-3 w-3 rounded-full border-2 ${
        active
          ? "border-amber-400 bg-amber-400 shadow-[0_0_12px_rgba(255,180,0,0.5)]"
          : "border-violet-400/60 bg-white dark:bg-neutral-900"
      }`}
    />
  );
}

/* ================================================================== */
/*  MAIN COMPONENT                                                    */
/* ================================================================== */

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  const { t } = useTranslation();

  return (
    <div className="custom-scrollbar fixed inset-0 z-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-[#fdf6ee] via-[#fef9f4] to-[#f8f0fa] text-neutral-800 dark:from-[#0d0b10] dark:via-[#100e15] dark:to-[#0d0b10] dark:text-neutral-200">
      {/* ============================================================ */}
      {/*  WATERCOLOR WASH — decorative background blobs               */}
      {/* ============================================================ */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {/* Top-left warm wash */}
        <div className="absolute -left-[20%] -top-[10%] h-[70vh] w-[70vh] rounded-full bg-[radial-gradient(circle,rgba(255,190,140,0.25),transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(160,120,200,0.08),transparent_70%)]" />
        {/* Top-right rose wash */}
        <div className="absolute -right-[15%] top-[5%] h-[60vh] w-[60vh] rounded-full bg-[radial-gradient(circle,rgba(245,160,180,0.20),transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(120,80,160,0.06),transparent_70%)]" />
        {/* Mid lavender wash */}
        <div className="absolute left-[30%] top-[40%] h-[50vh] w-[50vh] rounded-full bg-[radial-gradient(circle,rgba(180,160,240,0.15),transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(100,80,180,0.05),transparent_70%)]" />
        {/* Bottom gold wash */}
        <div className="absolute -left-[10%] bottom-[10%] h-[40vh] w-[40vh] rounded-full bg-[radial-gradient(circle,rgba(255,210,120,0.18),transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(120,100,60,0.05),transparent_70%)]" />
      </div>

      {/* ============================================================ */}
      {/*  HERO                                                        */}
      {/* ============================================================ */}
      <section className="relative flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-3xl"
        >
          {/* Badge */}
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-6 inline-block rounded-full border border-violet-300/30 bg-violet-50/60 px-5 py-2 text-[12px] font-bold tracking-[3px] text-violet-500 dark:border-violet-500/20 dark:bg-violet-500/[0.06] dark:text-violet-400"
          >
            {t("landing.hero.badge")}
          </motion.span>

          {/* Title */}
          <h1 className="mb-5 text-4xl font-extrabold leading-tight tracking-tight md:text-5xl lg:text-6xl">
            <span className="bg-gradient-to-r from-neutral-900 via-violet-700 to-rose-500 bg-clip-text text-transparent dark:from-white dark:via-violet-300 dark:to-rose-300">
              {t("landing.hero.title")}
            </span>
          </h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mx-auto mb-8 max-w-xl text-lg leading-relaxed text-neutral-500 dark:text-neutral-400"
          >
            {t("landing.hero.subtitle")}
          </motion.p>

          {/* Tagline pills: depositible / transferable / tradeable */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mb-10 flex flex-wrap items-center justify-center gap-3"
          >
            {(
              [
                {
                  key: "tagline_depositible",
                  color:
                    "bg-amber-100/70 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
                },
                {
                  key: "tagline_transferable",
                  color:
                    "bg-sky-100/70 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
                },
                {
                  key: "tagline_tradeable",
                  color:
                    "bg-rose-100/70 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
                },
              ] as const
            ).map(({ key, color }, i) => (
              <motion.span
                key={key}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.7 + i * 0.12 }}
                className={`rounded-lg px-4 py-1.5 text-[13px] font-semibold ${color}`}
              >
                {t(`landing.hero.${key}`)}
              </motion.span>
            ))}
          </motion.div>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.9 }}
            className="flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <button
              onClick={onGetStarted}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-7 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-violet-500/20 transition-all hover:-translate-y-0.5 hover:bg-violet-500 hover:shadow-violet-500/30 dark:bg-violet-500 dark:hover:bg-violet-400"
            >
              {t("landing.hero.cta_primary")}
              <ArrowRight className="h-4 w-4" />
            </button>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-300/60 bg-white/60 px-7 py-3.5 text-[15px] font-semibold text-neutral-700 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/80 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300 dark:hover:bg-white/[0.08]"
            >
              <Github className="h-5 w-5" />
              {t("landing.hero.cta_secondary")}
            </a>
          </motion.div>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          transition={{ duration: 1, delay: 1.5 }}
          className="absolute bottom-8"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <ChevronDown className="h-6 w-6 text-neutral-400" />
          </motion.div>
        </motion.div>
      </section>

      {/* ============================================================ */}
      {/*  PART 1 — TRUE AUTONOMOUS EXPLORATION                        */}
      {/* ============================================================ */}
      <Section id="explore">
        <div className="mb-12 text-center">
          <Badge>{t("landing.part1.badge")}</Badge>
          <h2 className="mb-4 text-3xl font-extrabold tracking-tight md:text-4xl">
            {t("landing.part1.title")}
          </h2>
          <p className="mx-auto max-w-xl text-[15px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {t("landing.part1.subtitle")}
          </p>
        </div>

        <div className="grid gap-12 md:grid-cols-2">
          {/* Timeline */}
          <div className="relative border-l-2 border-violet-300/30 pl-8 dark:border-violet-500/20">
            {([1, 2, 3, 4, 5] as const).map((n, i) => {
              const isSunrise = n === 5;
              return (
                <motion.div
                  key={n}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{
                    duration: 0.6,
                    delay: i * 0.12,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="relative mb-8 last:mb-0"
                >
                  <TimelineDot active={isSunrise} />
                  <p className="mb-1 font-mono text-xs text-neutral-400">
                    {t(`landing.part1.timeline.t${n}_time`)}
                  </p>
                  <h4 className="mb-1 text-[15px] font-bold">
                    {t(`landing.part1.timeline.t${n}_title`)}
                  </h4>
                  <p className="text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                    {t(`landing.part1.timeline.t${n}_desc`)}
                  </p>
                </motion.div>
              );
            })}
          </div>

          {/* Comparison card */}
          <div className="flex flex-col justify-center gap-6">
            <WatercolorCard tint={WC.rose}>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <div className="text-center">
                  <h4 className="mb-2 text-[13px] font-bold text-neutral-500 dark:text-neutral-400">
                    {t("landing.part1.compare_others")}
                  </h4>
                  <p className="whitespace-pre-line text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">
                    {t("landing.part1.compare_others_desc")}
                  </p>
                </div>
                <span className="text-[11px] font-extrabold tracking-widest text-neutral-300 dark:text-neutral-600">
                  VS
                </span>
                <div className="text-center">
                  <h4 className="mb-2 text-[13px] font-bold text-violet-600 dark:text-violet-400">
                    {t("landing.part1.compare_xyzen")}
                  </h4>
                  <p className="whitespace-pre-line text-xs leading-relaxed text-emerald-600 dark:text-emerald-400">
                    {t("landing.part1.compare_xyzen_desc")}
                  </p>
                </div>
              </div>
            </WatercolorCard>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  PART 2 — SELF-GROWING DIGITAL TEAM + AGENT SELF-GROWTH     */}
      {/* ============================================================ */}
      <Section id="team">
        <div className="mb-12 text-center">
          <Badge>{t("landing.part2.badge")}</Badge>
          <h2 className="mb-4 text-3xl font-extrabold tracking-tight md:text-4xl">
            {t("landing.part2.title")}
          </h2>
          <p className="mx-auto max-w-xl text-[15px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {t("landing.part2.subtitle")}
          </p>
        </div>

        {/* Topology + Teach flow */}
        <div className="grid gap-12 md:grid-cols-2">
          {/* Topology visualization */}
          <WatercolorCard
            tint={WC.lavender}
            className="flex flex-col items-center justify-center"
          >
            <div className="relative flex h-64 w-64 items-center justify-center">
              {/* Center node */}
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="z-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-rose-400 text-2xl shadow-lg shadow-violet-500/20"
              >
                <span role="img" aria-label="brain">
                  {"\u{1F9E0}"}
                </span>
              </motion.div>
              <p className="absolute top-[calc(50%+40px)] text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                {t("landing.part2.topology.center")}
              </p>
              {/* Satellite nodes */}
              {(
                [
                  {
                    key: "data",
                    angle: -90,
                    emoji: "\u{1F4CA}",
                    color: "from-violet-400/20 to-violet-500/10",
                  },
                  {
                    key: "code",
                    angle: -18,
                    emoji: "\u{1F4BB}",
                    color: "from-emerald-400/20 to-emerald-500/10",
                  },
                  {
                    key: "content",
                    angle: 54,
                    emoji: "\u270D\uFE0F",
                    color: "from-amber-400/20 to-amber-500/10",
                  },
                  {
                    key: "design",
                    angle: 126,
                    emoji: "\u{1F3A8}",
                    color: "from-rose-400/20 to-rose-500/10",
                  },
                  {
                    key: "research",
                    angle: 198,
                    emoji: "\u{1F50D}",
                    color: "from-sky-400/20 to-sky-500/10",
                  },
                ] as const
              ).map(({ key, angle, emoji, color }, i) => {
                const r = 100;
                const rad = (angle * Math.PI) / 180;
                const x = Math.cos(rad) * r;
                const y = Math.sin(rad) * r;
                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, scale: 0 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
                    className="absolute flex flex-col items-center gap-1"
                    style={{
                      left: `calc(50% + ${x}px - 20px)`,
                      top: `calc(50% + ${y}px - 20px)`,
                    }}
                  >
                    <motion.div
                      animate={{ y: [0, -4, 0] }}
                      transition={{
                        duration: 3,
                        delay: i * 0.4,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${color} border border-white/20 text-lg dark:border-white/10`}
                    >
                      <span role="img">{emoji}</span>
                    </motion.div>
                    <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
                      {t(`landing.part2.topology.${key}`)}
                    </span>
                  </motion.div>
                );
              })}
              {/* Connecting lines (SVG) */}
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox="0 0 256 256"
              >
                {[-90, -18, 54, 126, 198].map((angle) => {
                  const rad = (angle * Math.PI) / 180;
                  const cx = 128,
                    cy = 128;
                  const r = 100;
                  return (
                    <line
                      key={angle}
                      x1={cx}
                      y1={cy}
                      x2={cx + Math.cos(rad) * r}
                      y2={cy + Math.sin(rad) * r}
                      stroke="currentColor"
                      className="text-violet-300/30 dark:text-violet-500/20"
                      strokeWidth="1"
                      strokeDasharray="4 3"
                    />
                  );
                })}
              </svg>
            </div>
          </WatercolorCard>

          {/* Right: Teach once + flow */}
          <div className="flex flex-col justify-center">
            <h3 className="mb-3 text-xl font-bold">
              {t("landing.part2.teach_title")}
            </h3>
            <p className="mb-6 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              {t("landing.part2.teach_desc")}
            </p>

            {/* Error → Teach → Success flow */}
            <div className="mb-8 flex flex-wrap items-center gap-3">
              {(
                [
                  {
                    key: "flow_error",
                    bg: "bg-red-100/70 dark:bg-red-500/10",
                    text: "text-red-600 dark:text-red-400",
                  },
                  {
                    key: "flow_teach",
                    bg: "bg-amber-100/70 dark:bg-amber-500/10",
                    text: "text-amber-700 dark:text-amber-400",
                  },
                  {
                    key: "flow_success",
                    bg: "bg-emerald-100/70 dark:bg-emerald-500/10",
                    text: "text-emerald-600 dark:text-emerald-400",
                  },
                ] as const
              ).map(({ key, bg, text }, i) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.15 }}
                  className="flex items-center gap-3"
                >
                  {i > 0 && (
                    <ArrowRight className="h-4 w-4 text-neutral-300 dark:text-neutral-600" />
                  )}
                  <span
                    className={`rounded-lg px-3 py-2 text-[13px] font-semibold ${bg} ${text}`}
                  >
                    {t(`landing.part2.${key}`)}
                  </span>
                </motion.div>
              ))}
            </div>

            {/* Agent Self-Growth section */}
            <h3 className="mb-3 text-xl font-bold">
              {t("landing.part2.growth_title")}
            </h3>
            <p className="mb-5 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              {t("landing.part2.growth_desc")}
            </p>

            <div className="space-y-3">
              {(
                [
                  {
                    key: "skill_accumulation",
                    tint: WC.gold,
                    emoji: "\u{1F4E6}",
                  },
                  {
                    key: "pattern_recognition",
                    tint: WC.sky,
                    emoji: "\u{1F50E}",
                  },
                  {
                    key: "cross_learning",
                    tint: WC.lavender,
                    emoji: "\u{1F504}",
                  },
                ] as const
              ).map(({ key, tint, emoji }, i) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="rounded-lg p-4 backdrop-blur-sm"
                  style={{ background: tint }}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg" role="img">
                      {emoji}
                    </span>
                    <div>
                      <h4 className="text-[13px] font-bold">
                        {t(`landing.part2.growth_items.${key}`)}
                      </h4>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {t(`landing.part2.growth_items.${key}_desc`)}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  PART 3 — ALL-IN-ONE SPACE (Capability Bento Grid)           */}
      {/* ============================================================ */}
      <Section id="space">
        <div className="mb-12 text-center">
          <Badge>{t("landing.part3.badge")}</Badge>
          <h2 className="mb-4 text-3xl font-extrabold tracking-tight md:text-4xl">
            {t("landing.part3.title")}
          </h2>
          <p className="mx-auto max-w-xl text-[15px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {t("landing.part3.subtitle")}
          </p>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              {
                key: "autonomous",
                emoji: "\u{1F52E}",
                tint: WC.lavender,
                span: true,
              },
              { key: "team", emoji: "\u{1F91D}", tint: WC.sky, span: false },
              {
                key: "sandbox",
                emoji: "\u{1F6E0}\uFE0F",
                tint: WC.gold,
                span: false,
              },
              { key: "skills", emoji: "\u26A1", tint: WC.peach, span: false },
              { key: "memory", emoji: "\u{1F9E0}", tint: WC.rose, span: false },
              {
                key: "knowledge",
                emoji: "\u{1F4DA}",
                tint: WC.sky,
                span: false,
              },
              {
                key: "multimodal",
                emoji: "\u{1F5BC}\uFE0F",
                tint: WC.gold,
                span: false,
              },
              {
                key: "mcp",
                emoji: "\u{1F50C}",
                tint: WC.lavender,
                span: false,
              },
              {
                key: "scheduled_tasks",
                emoji: "\u{23F0}",
                tint: WC.gold,
                span: false,
              },
              {
                key: "agent_create_agent",
                emoji: "\u{1F9EC}",
                tint: WC.rose,
                span: true,
              },
              {
                key: "deploy",
                emoji: "\u{1F680}",
                tint: WC.peach,
                span: false,
              },
            ] as const
          ).map(({ key, emoji, tint, span }, i) => (
            <WatercolorCard
              key={key}
              tint={tint}
              delay={i * 0.06}
              className={span ? "sm:col-span-2 lg:col-span-2" : ""}
            >
              <div className="mb-2 text-2xl">
                <span role="img">{emoji}</span>
              </div>
              <h4 className="mb-1 text-[14px] font-bold">
                {t(`landing.part3.capabilities.${key}.title`)}
              </h4>
              <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                {t(`landing.part3.capabilities.${key}.desc`)}
              </p>
            </WatercolorCard>
          ))}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  PART 4 — CONNECT LOCAL COMPUTE                              */}
      {/* ============================================================ */}
      <Section id="runners">
        <div className="mb-12 text-center">
          <Badge>{t("landing.part4.badge")}</Badge>
          <h2 className="mb-4 text-3xl font-extrabold tracking-tight md:text-4xl">
            {t("landing.part4.title")}
          </h2>
          <p className="mx-auto max-w-xl text-[15px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {t("landing.part4.subtitle")}
          </p>
        </div>

        <div className="grid gap-12 md:grid-cols-2">
          {/* Left: Runner pipeline visualization */}
          <WatercolorCard
            tint={WC.sky}
            className="flex flex-col justify-center"
          >
            <h3 className="mb-3 text-lg font-bold">
              {t("landing.part4.how_title")}
            </h3>
            <p className="mb-6 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              {t("landing.part4.how_desc")}
            </p>

            {/* 4-step pipeline */}
            <div className="space-y-3">
              {(
                [
                  { key: "register", emoji: "\u{1F4CB}", tint: WC.lavender },
                  { key: "dispatch", emoji: "\u{1F4E1}", tint: WC.gold },
                  { key: "execute", emoji: "\u{2699}\uFE0F", tint: WC.peach },
                  { key: "report", emoji: "\u2705", tint: WC.sky },
                ] as const
              ).map(({ key, emoji, tint }, i) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, x: -15 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  className="flex items-start gap-3 rounded-lg p-3 backdrop-blur-sm"
                  style={{ background: tint }}
                >
                  <span className="mt-0.5 text-lg" role="img">
                    {emoji}
                  </span>
                  <div>
                    <h4 className="text-[13px] font-bold">
                      {t(`landing.part4.steps.${key}`)}
                    </h4>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {t(`landing.part4.steps.${key}_desc`)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </WatercolorCard>

          {/* Right: Benefits grid */}
          <div className="grid grid-cols-2 gap-4">
            {(
              [
                { key: "privacy", emoji: "\u{1F512}", tint: WC.lavender },
                { key: "gpu", emoji: "\u{1F3AE}", tint: WC.gold },
                { key: "cost", emoji: "\u{1F4B0}", tint: WC.peach },
                { key: "hybrid", emoji: "\u{1F310}", tint: WC.rose },
              ] as const
            ).map(({ key, emoji, tint }, i) => (
              <WatercolorCard key={key} tint={tint} delay={i * 0.08}>
                <div className="mb-2 text-2xl">
                  <span role="img">{emoji}</span>
                </div>
                <h4 className="mb-1 text-[13px] font-bold">
                  {t(`landing.part4.benefits.${key}.title`)}
                </h4>
                <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {t(`landing.part4.benefits.${key}.desc`)}
                </p>
              </WatercolorCard>
            ))}
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  PART 5 — AGENT ECONOMY                                      */}
      {/* ============================================================ */}
      <Section id="economy">
        <div className="mb-12 text-center">
          <Badge>{t("landing.part5.badge")}</Badge>
          <h2 className="mb-4 text-3xl font-extrabold tracking-tight md:text-4xl">
            {t("landing.part5.title")}
          </h2>
          <p className="mx-auto max-w-xl text-[15px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {t("landing.part5.subtitle")}
          </p>
        </div>

        {/* Thesis */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mx-auto mb-12 max-w-2xl text-center text-[15px] leading-loose text-neutral-500 dark:text-neutral-400"
        >
          {t("landing.part5.thesis")}
        </motion.p>

        {/* 2x2 economy matrix */}
        <div className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(
            [
              {
                key: "human_human",
                label: "label_traditional",
                tint: WC.peach,
                icons: ["\u{1F464}", "\u{1F6D2}", "\u{1F464}"],
              },
              {
                key: "human_agent",
                label: "label_xyzen",
                tint: WC.gold,
                icons: ["\u{1F464}", "\u{1F6D2}", "\u{1F916}"],
              },
              {
                key: "agent_human",
                label: "label_xyzen",
                tint: WC.sky,
                icons: ["\u{1F916}", "\u{1F6D2}", "\u{1F464}"],
              },
              {
                key: "agent_agent",
                label: "label_autonomous",
                tint: WC.lavender,
                icons: ["\u{1F916}", "\u{1F6D2}", "\u{1F916}"],
              },
            ] as const
          ).map(({ key, label, tint, icons }, i) => (
            <WatercolorCard key={key} tint={tint} delay={i * 0.1}>
              <span className="mb-3 inline-block rounded-md bg-white/50 px-2 py-0.5 text-[11px] font-bold text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">
                {t(`landing.part5.${label}`)}
              </span>
              <div className="mb-3 flex items-center justify-center gap-2 text-2xl">
                <span role="img">{icons[0]}</span>
                <ArrowRight className="h-4 w-4 text-violet-400/60" />
                <span role="img">{icons[1]}</span>
                <ArrowRight className="h-4 w-4 text-violet-400/60" />
                <span role="img">{icons[2]}</span>
              </div>
              <h4 className="mb-1 text-center text-[14px] font-bold">
                {t(`landing.part5.matrix.${key}`)}
              </h4>
              <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
                {t(`landing.part5.matrix.${key}_desc`)}
              </p>
            </WatercolorCard>
          ))}
        </div>

        {/* Flywheel */}
        <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4">
          {(
            [
              { key: "create", emoji: "\u{1F9E0}" },
              { key: "trade", emoji: "\u{1F6D2}" },
              { key: "consume", emoji: "\u{1F52E}" },
              { key: "evolve", emoji: "\u{1F4C8}" },
            ] as const
          ).map(({ key, emoji }, i) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="flex items-center gap-2 md:gap-4"
            >
              {i > 0 && (
                <motion.span
                  animate={{ x: [0, 4, 0] }}
                  transition={{
                    duration: 1.5,
                    delay: i * 0.2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="text-neutral-300 dark:text-neutral-600"
                >
                  <ArrowRight className="h-4 w-4" />
                </motion.span>
              )}
              <div className="flex flex-col items-center gap-1">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-white/40 text-xl backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
                  <span role="img">{emoji}</span>
                </div>
                <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                  {t(`landing.part5.flywheel.${key}`)}
                </span>
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                  {t(`landing.part5.flywheel.${key}_sub`)}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  OPEN SOURCE CARD                                            */}
      {/* ============================================================ */}
      <Section>
        <WatercolorCard
          tint={WC.lavender}
          className="mx-auto max-w-3xl text-center !py-12 !px-8"
        >
          <Github className="mx-auto mb-4 h-10 w-10 text-neutral-600 dark:text-neutral-300" />
          <h2 className="mb-3 text-2xl font-extrabold md:text-3xl">
            {t("landing.opensource.title")}
          </h2>
          <p className="mx-auto mb-6 max-w-lg text-[14px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {t("landing.opensource.desc")}
          </p>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-4 inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-7 py-3.5 text-[15px] font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
          >
            <Github className="h-5 w-5" />
            {t("landing.opensource.view_github")}
          </a>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            {t("landing.opensource.license")}
          </p>
        </WatercolorCard>
      </Section>

      {/* ============================================================ */}
      {/*  FINAL CTA                                                   */}
      {/* ============================================================ */}
      <Section>
        <div className="relative text-center">
          {/* Decorative glow */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(180,160,240,0.15),transparent_70%)] blur-2xl dark:bg-[radial-gradient(circle,rgba(120,100,200,0.08),transparent_70%)]" />

          <h2 className="mb-4 text-3xl font-extrabold tracking-tight md:text-4xl">
            {t("landing.cta.title")}
          </h2>
          <p className="mx-auto mb-10 max-w-lg text-[15px] text-neutral-500 dark:text-neutral-400">
            {t("landing.cta.subtitle")}
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-300/60 bg-white/60 px-7 py-3.5 text-[15px] font-semibold text-neutral-700 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/80 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300 dark:hover:bg-white/[0.08]"
            >
              <Github className="h-5 w-5" />
              {t("landing.cta.github")}
            </a>
            <button
              onClick={onGetStarted}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-7 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-violet-500/20 transition-all hover:-translate-y-0.5 hover:bg-violet-500 hover:shadow-violet-500/30 dark:bg-violet-500 dark:hover:bg-violet-400"
            >
              {t("landing.cta.start")}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-6 text-xs text-neutral-400 dark:text-neutral-500">
            {t("landing.cta.license")}
          </p>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  FOOTER                                                      */}
      {/* ============================================================ */}
      <footer className="relative border-t border-neutral-200/40 px-6 py-10 dark:border-white/[0.06]">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-neutral-500 dark:text-neutral-400">
            <a
              href="#/terms"
              className="inline-flex items-center gap-1 transition-colors hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              <Scale className="h-3.5 w-3.5" />
              {t("landing.footer.terms")}
            </a>
            <a
              href="#/privacy"
              className="inline-flex items-center gap-1 transition-colors hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              <Shield className="h-3.5 w-3.5" />
              {t("landing.footer.privacy")}
            </a>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 transition-colors hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              <Github className="h-3.5 w-3.5" />
              GitHub
            </a>
            <a
              href={`${GITHUB_REPO_URL}/blob/main/LICENSE`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              License
            </a>
          </div>
          <p className="text-center text-xs text-neutral-400 dark:text-neutral-500">
            {t("landing.footer.copyright")}
          </p>
        </div>
      </footer>
    </div>
  );
}
