import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { StarsBackground } from "@/components/animate-ui/components/backgrounds/stars";
import { RippleButton } from "@/components/animate-ui/components/buttons/ripple";
import { Typewriter } from "@/components/animate-ui/components/texts/typewriter";

const GITHUB_REPO_URL = "https://github.com/ScienceOL/Xyzen";

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  const { t } = useTranslation();
  const [titleComplete, setTitleComplete] = useState(false);

  const handleLearnMore = () => {
    window.open(GITHUB_REPO_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <StarsBackground className="h-screen">
      {/* Hero Section - Full viewport centered */}
      <section className="relative z-10 flex h-full flex-col items-center justify-center px-6">
        <div className="text-center max-w-4xl">
          {/* Title with Typewriter Effect and Gradient */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 tracking-tight">
            <Typewriter
              text={t("landing.hero.title")}
              delay={0.3}
              speed={0.04}
              cursor={true}
              cursorChar="|"
              onComplete={() => setTitleComplete(true)}
              className="bg-gradient-to-r from-white via-white to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]"
            />
          </h1>

          {/* Subtitle - Fades in after title */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={titleComplete ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-lg md:text-xl lg:text-2xl text-white/70 mb-12 max-w-2xl mx-auto leading-relaxed"
          >
            {t("landing.hero.subtitle")}
          </motion.p>

          {/* CTA Buttons - Fade in after subtitle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={titleComplete ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <RippleButton
              onClick={onGetStarted}
              className="px-8 py-4 text-lg font-semibold rounded-lg bg-white text-black hover:bg-white/90 transition-colors"
            >
              {t("landing.hero.cta_primary")}
            </RippleButton>
            <RippleButton
              variant="ghost"
              onClick={handleLearnMore}
              className="px-8 py-4 text-lg font-semibold rounded-lg border border-white/30 text-white bg-transparent hover:bg-white/10 transition-colors"
            >
              {t("landing.hero.cta_secondary")}
            </RippleButton>
          </motion.div>
        </div>

        {/* Subtle scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={titleComplete ? { opacity: 0.5 } : {}}
          transition={{ duration: 1, delay: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center"
          >
            <motion.div className="w-1.5 h-3 bg-white/50 rounded-full mt-2" />
          </motion.div>
        </motion.div>
      </section>
    </StarsBackground>
  );
}
