import { useRef, useCallback } from "react";
import { motion } from "motion/react";
import { ArrowRight, Github, ChevronDown, Compass, Coins } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HeroScene } from "./HeroScene";
import { CodeWaterfall } from "./CodeWaterfall";
import { DataWaterfall } from "./DataWaterfall";

const GITHUB_REPO_URL = "https://github.com/ScienceOL/Xyzen";

interface HeroSectionProps {
  onGetStarted: () => void;
}

export function HeroSection({ onGetStarted }: HeroSectionProps) {
  const { t } = useTranslation();
  const bgRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!bgRef.current) return;
    const { clientX, clientY, currentTarget } = e;
    const rect = currentTarget.getBoundingClientRect();
    const mx = (clientX - rect.left) / rect.width - 0.5; // -0.5 to 0.5
    const my = (clientY - rect.top) / rect.height - 0.5;
    bgRef.current.style.transform = `rotateY(${mx * 2}deg) rotateX(${-my * 1.5}deg)`;
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!bgRef.current) return;
    bgRef.current.style.transform = "rotateY(0deg) rotateX(0deg)";
  }, []);

  return (
    <section
      id="hero"
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden"
      style={{ perspective: 1200 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Parallax background wrapper */}
      <div
        ref={bgRef}
        className="pointer-events-none absolute inset-0"
        style={{
          transition: "transform 0.15s ease-out",
          willChange: "transform",
        }}
      >
        {/* 3D Background — split composition */}
        <HeroScene />

        {/* Code waterfall — left side, CSS-based */}
        <CodeWaterfall />

        {/* Data waterfall — right side, flows upward */}
        <DataWaterfall />

        {/* Gradient overlays for text readability */}
        {/* Center darkening strip so text pops */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(0,0,0,0.75)_0%,transparent_100%)]" />
        {/* Top/bottom fade */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/80" />
      </div>

      {/* Text overlay — centered between the two worlds */}
      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="mb-1 text-3xl font-extrabold leading-tight tracking-tight md:text-5xl lg:text-6xl"
        >
          <span className="bg-gradient-to-r from-blue-200 via-white to-blue-300 bg-clip-text text-transparent">
            {t("landing.v2.hero.title1")}
          </span>
        </motion.h1>
        <motion.h1
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.35 }}
          className="mb-6 text-3xl font-extrabold leading-tight tracking-tight md:text-5xl lg:text-6xl"
        >
          <span className="bg-gradient-to-r from-violet-300 via-rose-300 to-amber-300 bg-clip-text text-transparent">
            {t("landing.v2.hero.title2")}
          </span>
        </motion.h1>

        {/* Two concept pillars — clickable, scroll to sections */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.55 }}
          className="mb-6 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-5"
        >
          {/* Autonomous Exploration */}
          <button
            onClick={() =>
              document
                .getElementById("autonomous-exploration")
                ?.scrollIntoView({ behavior: "smooth" })
            }
            className="relative overflow-hidden rounded-lg shadow-[0_0_12px_rgba(139,92,246,0.12)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(139,92,246,0.2)]"
          >
            {/* Rotating border — circle so corners stay filled */}
            <motion.span
              className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[max(300%,300%)] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background:
                  "conic-gradient(from 0deg, rgba(139,92,246,0.12) 0%, rgba(139,92,246,0.5) 25%, rgba(139,92,246,0.12) 50%, rgba(139,92,246,0.5) 75%, rgba(139,92,246,0.12) 100%)",
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
            />
            {/* Inner fill */}
            <span className="absolute inset-[1px] rounded-[7px] bg-[#08080f]/85 backdrop-blur-sm" />
            {/* Content */}
            <span className="relative flex items-center gap-3 px-6 py-3">
              <Compass className="h-5 w-5 text-violet-400" />
              <span className="text-[15px] font-semibold text-violet-200">
                {t("landing.v2.hero.pillarExploration")}
              </span>
            </span>
          </button>

          {/* Agent Economy */}
          <button
            onClick={() =>
              document
                .getElementById("agent-economy")
                ?.scrollIntoView({ behavior: "smooth" })
            }
            className="relative overflow-hidden rounded-lg shadow-[0_0_12px_rgba(245,158,11,0.12)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(245,158,11,0.2)]"
          >
            {/* Rotating border — circle so corners stay filled */}
            <motion.span
              className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[max(300%,300%)] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background:
                  "conic-gradient(from 180deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.5) 25%, rgba(245,158,11,0.12) 50%, rgba(245,158,11,0.5) 75%, rgba(245,158,11,0.12) 100%)",
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
            />
            {/* Inner fill */}
            <span className="absolute inset-[1px] rounded-[7px] bg-[#08080f]/85 backdrop-blur-sm" />
            {/* Content */}
            <span className="relative flex items-center gap-3 px-6 py-3">
              <Coins className="h-5 w-5 text-amber-400" />
              <span className="text-[15px] font-semibold text-amber-200">
                {t("landing.v2.hero.pillarEconomy")}
              </span>
            </span>
          </button>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="mx-auto mb-8 max-w-lg text-[15px] leading-relaxed text-neutral-400"
        >
          {t("landing.v2.hero.subtitle")}
        </motion.p>

        {/* CTA buttons */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1 }}
          className="flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <button
            onClick={onGetStarted}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-6 py-3 text-[14px] font-bold text-white shadow-lg shadow-violet-500/20 transition-all hover:-translate-y-0.5 hover:bg-violet-500 hover:shadow-violet-500/35"
          >
            {t("landing.v2.hero.getStarted")}
            <ArrowRight className="h-4 w-4" />
          </button>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-6 py-3 text-[14px] font-semibold text-neutral-300 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/[0.08]"
          >
            <Github className="h-4 w-4" />
            {t("landing.v2.hero.starOnGithub")}
          </a>
        </motion.div>
      </div>

      {/* Scroll hint */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.35 }}
        transition={{ duration: 1, delay: 1.5 }}
        className="absolute bottom-6"
      >
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="h-5 w-5 text-neutral-500" />
        </motion.div>
      </motion.div>
    </section>
  );
}
