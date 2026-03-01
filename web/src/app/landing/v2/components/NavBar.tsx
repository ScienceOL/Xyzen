import { motion } from "motion/react";
import { Github } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePageScroll } from "../hooks/useScrollProgress";

const GITHUB_REPO_URL = "https://github.com/ScienceOL/Xyzen";

interface NavBarProps {
  onGetStarted: () => void;
}

export function NavBar({ onGetStarted }: NavBarProps) {
  const { t } = useTranslation();
  const scrollY = usePageScroll();
  const scrolled = scrollY > 40;

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-white/[0.06] bg-[#07080F]/80 backdrop-blur-xl"
          : "bg-transparent"
      }`}
    >
      {/* Bottom fade — blur + tint that fades out via mask-image */}
      <div
        className="pointer-events-none absolute inset-x-0 top-full h-20 transition-opacity duration-300"
        style={{
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          background:
            "linear-gradient(to bottom, rgba(7,8,15,0.55), rgba(7,8,15,0.15) 50%, transparent)",
          maskImage: "linear-gradient(to bottom, black, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
          opacity: scrolled ? 1 : 0,
        }}
      />

      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5">
          <img src="/icon-512.png" alt="Xyzen" className="h-8 w-8 rounded-lg" />
          <span className="text-[15px] font-bold tracking-wide text-white">
            Xyzen
          </span>
        </a>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-neutral-400 transition-colors hover:text-white"
          >
            <Github className="h-4 w-4" />
            <span className="hidden sm:inline">
              {t("landing.v2.nav.github")}
            </span>
          </a>
          <button
            onClick={onGetStarted}
            className="rounded-lg bg-white/[0.08] px-4 py-2 text-[13px] font-semibold text-white transition-all hover:bg-white/[0.14]"
          >
            {t("landing.v2.nav.getStarted")}
          </button>
        </div>
      </div>
    </motion.nav>
  );
}
