"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import AgentMarketplace from "@/app/marketplace/AgentMarketplace";
import SkillMarketplace from "@/app/skill-marketplace/SkillMarketplace";

type CommunitySection = "agents" | "skills";

export default function CommunityHub() {
  const { t } = useTranslation();
  const [section, setSection] = useState<CommunitySection>("agents");
  const [skillsLoaded, setSkillsLoaded] = useState(false);
  const [headerTarget, setHeaderTarget] = useState<HTMLDivElement | null>(null);

  const isAgents = section === "agents";

  const switchTo = (s: CommunitySection) => {
    if (s === "skills") setSkillsLoaded(true);
    setSection(s);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Stable header — never slides */}
      <div className="shrink-0 bg-neutral-50/80 backdrop-blur-xl dark:bg-black/80">
        <div className="mx-auto max-w-7xl px-4 pt-3 pb-2 md:px-6">
          <div className="flex items-center justify-between gap-3">
            {/* Section switcher */}
            <div
              className={`relative grid w-fit shrink-0 grid-cols-2 bg-neutral-100/50 p-[3px] ring-1 dark:bg-white/[0.03] ${
                isAgents
                  ? "ring-violet-300/15 dark:ring-violet-400/10"
                  : "ring-emerald-300/15 dark:ring-emerald-400/10"
              }`}
            >
              <div
                className={`pointer-events-none absolute inset-y-[3px] w-[calc(50%-3px)] transition-[left] duration-300 ease-out ${
                  isAgents ? "left-[3px]" : "left-[50%]"
                }`}
              >
                <div className="absolute inset-0 bg-white shadow-sm dark:bg-white/[0.08] dark:shadow-none" />
                <div
                  className={`absolute inset-0 bg-gradient-to-t to-transparent ${
                    isAgents
                      ? "from-violet-400/[0.06]"
                      : "from-emerald-400/[0.06]"
                  }`}
                />
                <div
                  className={`absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r ${
                    isAgents
                      ? "from-violet-300/20 via-violet-400/90 to-violet-300/20 dark:from-violet-500/10 dark:via-violet-400/80 dark:to-violet-500/10"
                      : "from-emerald-300/20 via-emerald-400/90 to-emerald-300/20 dark:from-emerald-500/10 dark:via-emerald-400/80 dark:to-emerald-500/10"
                  }`}
                />
              </div>
              <button
                onClick={() => switchTo("agents")}
                className="relative z-10 px-5 py-2 text-center"
              >
                <span
                  className={`text-[13px] transition-colors duration-200 ${
                    isAgents
                      ? "font-bold text-neutral-900 dark:text-violet-50"
                      : "font-medium text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                  }`}
                >
                  {t("skillMarketplace.communityHub.agents")}
                </span>
              </button>
              <button
                onClick={() => switchTo("skills")}
                className="relative z-10 px-5 py-2 text-center"
              >
                <span
                  className={`text-[13px] transition-colors duration-200 ${
                    !isAgents
                      ? "font-bold text-neutral-900 dark:text-emerald-50"
                      : "font-medium text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                  }`}
                >
                  {t("skillMarketplace.communityHub.skills")}
                </span>
              </button>
            </div>

            {/* Portal target — marketplace controls render here */}
            <div
              ref={setHeaderTarget}
              className="flex flex-1 items-center justify-end gap-3"
            />
          </div>
        </div>
        <div className="h-px bg-neutral-200/60 dark:bg-neutral-800/60" />
      </div>

      {/* Sliding content — only this part moves */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{
            transform: isAgents ? "translateX(0)" : "translateX(-100%)",
          }}
        >
          <div className="h-full w-full shrink-0">
            <AgentMarketplace headerPortal={isAgents ? headerTarget : null} />
          </div>
          <div className="h-full w-full shrink-0">
            {skillsLoaded && (
              <SkillMarketplace
                headerPortal={!isAgents ? headerTarget : null}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
