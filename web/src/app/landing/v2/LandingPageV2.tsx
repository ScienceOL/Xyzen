import { Github, ArrowRight, Scale, Shield, ScrollText } from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { NavBar } from "./components/NavBar";
import { HeroSection } from "./components/HeroSection";
import { AutonomousExploration } from "./components/AutonomousExploration";
import { AgentEconomy } from "./components/AgentEconomy";
import { AgentCapabilities } from "./components/AgentCapabilities";
import { SectionIndicator } from "./components/SectionIndicator";

const GITHUB_REPO_URL = "https://github.com/ScienceOL/Xyzen";

/* ------------------------------------------------------------------ */
/*  Reusable: scroll-triggered section wrapper                         */
/* ------------------------------------------------------------------ */
function SectionFadeIn({
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
      id={id}
      ref={ref}
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
/*  Open Source Card — ported from v1                                   */
/* ------------------------------------------------------------------ */
function OpenSourceSection() {
  const { t } = useTranslation();
  return (
    <SectionFadeIn id="open-source">
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.06] bg-[#0c0d14]/80 px-8 py-12 text-center backdrop-blur-sm">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(180,160,240,0.08),transparent_70%)] blur-2xl" />

        <Github className="mx-auto mb-4 h-10 w-10 text-neutral-300" />
        <h2 className="mb-3 text-2xl font-extrabold text-white md:text-3xl">
          {t("landing.opensource.title")}
        </h2>
        <p className="mx-auto mb-6 max-w-lg text-[14px] leading-relaxed text-neutral-400">
          {t("landing.opensource.desc")}
        </p>
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 inline-flex items-center gap-2 rounded-lg bg-white px-7 py-3.5 text-[15px] font-bold text-neutral-900 shadow-lg transition-all hover:-translate-y-0.5 hover:bg-neutral-100"
        >
          <Github className="h-5 w-5" />
          {t("landing.opensource.view_github")}
        </a>
        <p className="text-xs text-neutral-500">
          {t("landing.opensource.license")}
        </p>
      </div>
    </SectionFadeIn>
  );
}

/* ------------------------------------------------------------------ */
/*  Final CTA — ported from v1                                         */
/* ------------------------------------------------------------------ */
function FinalCTA({ onGetStarted }: { onGetStarted: () => void }) {
  const { t } = useTranslation();
  return (
    <SectionFadeIn>
      <div className="relative text-center">
        {/* Decorative glow */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(120,100,200,0.08),transparent_70%)] blur-2xl" />

        <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-white md:text-4xl">
          {t("landing.cta.title")}
        </h2>
        <p className="mx-auto mb-10 max-w-lg text-[15px] text-neutral-400">
          {t("landing.cta.subtitle")}
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-7 py-3.5 text-[15px] font-semibold text-neutral-300 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/[0.08]"
          >
            <Github className="h-5 w-5" />
            {t("landing.cta.github")}
          </a>
          <button
            onClick={onGetStarted}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-500 px-7 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-violet-500/20 transition-all hover:-translate-y-0.5 hover:bg-violet-400 hover:shadow-violet-500/30"
          >
            {t("landing.cta.start")}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-6 text-xs text-neutral-500">
          {t("landing.cta.license")}
        </p>
      </div>
    </SectionFadeIn>
  );
}

interface LandingPageV2Props {
  onGetStarted: () => void;
}

export function LandingPageV2({ onGetStarted }: LandingPageV2Props) {
  const { t } = useTranslation();

  return (
    <div className="custom-scrollbar fixed inset-0 z-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-black via-[#05060e] to-[#0a0b16] text-white">
      {/* Ambient background washes — dark cosmic feel */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-[20%] top-[20%] h-[60vh] w-[60vh] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.06),transparent_70%)] blur-3xl" />
        <div className="absolute -right-[15%] top-[50%] h-[50vh] w-[50vh] rounded-full bg-[radial-gradient(circle,rgba(244,63,94,0.04),transparent_70%)] blur-3xl" />
        <div className="absolute bottom-[10%] left-[30%] h-[40vh] w-[40vh] rounded-full bg-[radial-gradient(circle,rgba(6,182,212,0.04),transparent_70%)] blur-3xl" />
      </div>

      {/* Section position indicator — left side */}
      <SectionIndicator />

      {/* Sticky Nav */}
      <NavBar onGetStarted={onGetStarted} />

      {/* ============================================================ */}
      {/*  HERO — "One SuperBrain, or Many Minds, Each a Master?"      */}
      {/* ============================================================ */}
      <HeroSection onGetStarted={onGetStarted} />

      {/* ============================================================ */}
      {/*  PART 1 — Autonomous Exploration                             */}
      {/* ============================================================ */}
      <AutonomousExploration />

      {/* ============================================================ */}
      {/*  PART 2 — Agent Economy                                      */}
      {/* ============================================================ */}
      <AgentEconomy />

      {/* ============================================================ */}
      {/*  PART 3 — Agent Capabilities (slot-machine showcase)         */}
      {/* ============================================================ */}
      <AgentCapabilities />

      {/* ============================================================ */}
      {/*  BOTTOM ZONE — gradient wrapper for visual continuity         */}
      {/* ============================================================ */}
      <div
        className="relative"
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, rgba(12,10,22,0.4) 15%, rgba(16,12,30,0.7) 40%, rgba(10,8,20,0.9) 70%, #08060f 100%)",
        }}
      >
        {/* Subtle violet wash behind CTA area */}
        <div className="pointer-events-none absolute left-1/2 top-[40%] -z-10 h-[50vh] w-[70vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(139,92,246,0.05),transparent_70%)] blur-3xl" />

        {/* ── OPEN SOURCE CARD ── */}
        <OpenSourceSection />

        {/* ── FINAL CTA ── */}
        <FinalCTA onGetStarted={onGetStarted} />

        {/* ── FOOTER ── */}
        <footer className="border-t border-white/[0.04] px-6 py-10">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-5">
            <div className="flex items-center gap-2.5">
              <img
                src="/icon-512.png"
                alt="Xyzen"
                className="h-5 w-5 opacity-40"
              />
              <span className="text-xs font-medium tracking-wider text-neutral-600">
                XYZEN
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-neutral-500">
              <a
                href="#/terms"
                className="inline-flex items-center gap-1 transition-colors hover:text-neutral-200"
              >
                <Scale className="h-3.5 w-3.5" />
                {t("landing.footer.terms")}
              </a>
              <a
                href="#/privacy"
                className="inline-flex items-center gap-1 transition-colors hover:text-neutral-200"
              >
                <Shield className="h-3.5 w-3.5" />
                {t("landing.footer.privacy")}
              </a>
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-neutral-200"
              >
                <Github className="h-3.5 w-3.5" />
                {t("landing.footer.github")}
              </a>
              <a
                href={`${GITHUB_REPO_URL}/blob/main/LICENSE`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-neutral-200"
              >
                <ScrollText className="h-3.5 w-3.5" />
                {t("landing.footer.license")}
              </a>
            </div>
            <p className="text-center text-xs text-neutral-600">
              {t("landing.footer.copyright")}
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
