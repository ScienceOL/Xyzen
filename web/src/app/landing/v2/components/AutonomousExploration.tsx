import { motion, AnimatePresence, useInView } from "motion/react";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Crown, Sparkles, Check } from "lucide-react";

/* ================================================================== */
/*  Types & Constants                                                   */
/* ================================================================== */

const ART_DECO = `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cpath d='M30 0c0 16.569-13.431 30-30 30C16.569 30 30 16.569 30 0z' fill='%23fff' fill-opacity='.04'/%3E%3Cpath d='M60 0c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23fff' fill-opacity='.04'/%3E%3Cpath d='M30 30c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23fff' fill-opacity='.04'/%3E%3Cpath d='M60 30c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23fff' fill-opacity='.04'/%3E%3C/g%3E%3C/svg%3E")`;

interface AgentDef {
  id: string;
  icon: string;
  name: string;
  color: string;
  task: string;
  lines: string[];
  result: string;
}

interface Scenario {
  dayChat: string[];
  ceoLog: string[];
  agents: AgentDef[];
  results: string[];
}

/* Static parts of each scenario agent (non-translatable: id, icon, color, terminal lines) */
const SCENARIO_AGENT_STATIC = [
  [
    {
      id: "fix",
      icon: "\u{1F527}",
      color: "#F43F5E",
      lines: [
        "git checkout -b fix/auth-null",
        "patching null check\u2026",
        "tests: 14/14 \u2713",
      ],
    },
    {
      id: "perf",
      icon: "\u26A1",
      color: "#06B6D4",
      lines: [
        "profiling endpoint\u2026",
        "bottleneck: N+1 query",
        "optimized: 2.1s \u2192 340ms",
      ],
    },
    {
      id: "test",
      icon: "\u{1F9EA}",
      color: "#10B981",
      lines: [
        "generating test suite\u2026",
        "auth.test.ts: 14 specs",
        "all passing \u2713",
      ],
    },
    {
      id: "pr",
      icon: "\u{1F4CB}",
      color: "#8B5CF6",
      lines: [
        "staging 3 files\u2026",
        "writing description\u2026",
        "PR #203 created \u2713",
      ],
    },
  ],
  [
    {
      id: "theme",
      icon: "\u{1F3A8}",
      color: "#F59E0B",
      lines: [
        "extracting color palette\u2026",
        "generating 48 tokens\u2026",
        "theme.dark.ts written \u2713",
      ],
    },
    {
      id: "code",
      icon: "\u{1F4BB}",
      color: "#10B981",
      lines: [
        "Header.tsx \u2713  Sidebar.tsx \u2713",
        "Modal.tsx \u2713  Card.tsx \u2713",
        "12/12 components done \u2713",
      ],
    },
    {
      id: "visual",
      icon: "\u{1F4F8}",
      color: "#06B6D4",
      lines: [
        "capturing 34 screenshots\u2026",
        "comparing baselines\u2026",
        "0 regressions \u2713",
      ],
    },
    {
      id: "docs",
      icon: "\u{1F4DD}",
      color: "#8B5CF6",
      lines: [
        "generating examples\u2026",
        "writing dark mode section\u2026",
        "published to wiki \u2713",
      ],
    },
  ],
  [
    {
      id: "debug",
      icon: "\u{1F50D}",
      color: "#F43F5E",
      lines: [
        "heap snapshot captured\u2026",
        "3 listeners not disposed",
        "root cause identified \u2713",
      ],
    },
    {
      id: "fixer",
      icon: "\u{1F527}",
      color: "#10B981",
      lines: [
        "git checkout -b fix/ws-leak",
        "adding disposal logic\u2026",
        "leak patched \u2713",
      ],
    },
    {
      id: "audit",
      icon: "\u{1F6E1}\uFE0F",
      color: "#F59E0B",
      lines: [
        "scanning 89 useEffects\u2026",
        "2 more leaks found",
        "all patched \u2713",
      ],
    },
    {
      id: "ci",
      icon: "\u{1F4CA}",
      color: "#8B5CF6",
      lines: [
        "writing heap size check\u2026",
        "adding to CI pipeline\u2026",
        "memory gate active \u2713",
      ],
    },
  ],
];

interface TranslatedScenario {
  dayChat: string[];
  ceoLog: string[];
  agentNames: string[];
  agentTasks: string[];
  agentResults: string[];
  results: string[];
}

const SCENARIO_COUNT = SCENARIO_AGENT_STATIC.length;

const AGENT_POSITIONS = [
  { top: "12%", left: "56%" },
  { top: "33%", left: "60%" },
  { top: "54%", left: "56%" },
  { top: "75%", left: "60%" },
];

const BEAM_PATHS = [
  "M 32,50 C 42,36 50,20 56,16",
  "M 32,50 C 42,46 52,38 60,37",
  "M 32,50 C 42,54 50,56 56,58",
  "M 32,50 C 42,64 52,74 60,79",
];

type AgentPhase = "hidden" | "beaming" | "active" | "completing";

// Full day+night cycle — 20 s total
const CYCLE_DURATION = 20000;
const DUR = CYCLE_DURATION / 1000; // 20

/* ================================================================== */
/*  Celestial — continuous sun + moon arcs (repeat: Infinity)           */
/* ================================================================== */

const STARS = [
  { x: "12%", y: "18%", s: 0.7 },
  { x: "28%", y: "8%", s: 1 },
  { x: "45%", y: "14%", s: 0.6 },
  { x: "62%", y: "6%", s: 0.9 },
  { x: "78%", y: "12%", s: 0.5 },
  { x: "88%", y: "20%", s: 0.8 },
  { x: "35%", y: "22%", s: 0.6 },
  { x: "55%", y: "18%", s: 0.7 },
  { x: "20%", y: "25%", s: 0.5 },
  { x: "70%", y: "22%", s: 0.6 },
];

function CelestialCycle({ activated }: { activated: boolean }) {
  if (!activated) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[0] overflow-hidden">
      {/* ── Stars — visible during night half (50-100%) ── */}
      {STARS.map((star, i) => (
        <motion.div
          key={`star-${i}`}
          className="absolute rounded-full bg-white"
          style={{
            left: star.x,
            top: star.y,
            width: star.s * 2,
            height: star.s * 2,
          }}
          //               start  ──day──  appear  twinkle         fade  end
          animate={{ opacity: [0, 0, 0, 0.7, 0.25, 0.65, 0.3, 0] }}
          transition={{
            duration: DUR,
            times: [
              0,
              0.3,
              0.5 + i * 0.008,
              0.56 + i * 0.008,
              0.65,
              0.78,
              0.88,
              0.96,
            ],
            ease: "linear",
            repeat: Infinity,
          }}
        />
      ))}

      {/* ── Sun — arcs during DAY half (0 → 50%) ──
           first frame = last frame = opacity 0 at horizon-left */}
      <motion.div
        className="absolute"
        animate={{
          //          rise         peak        set           ──night──   back to start
          left: ["-3%", "18%", "50%", "82%", "103%", "103%", "-3%"],
          top: ["68%", "10%", "3%", "10%", "68%", "68%", "68%"],
          opacity: [0, 0.95, 1, 0.95, 0, 0, 0],
        }}
        transition={{
          duration: DUR,
          times: [0, 0.1, 0.25, 0.4, 0.5, 0.75, 1],
          ease: "linear",
          repeat: Infinity,
        }}
      >
        {/* Sun glow */}
        <div
          className="absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,180,60,0.08) 0%, rgba(255,150,50,0.02) 40%, transparent 70%)",
          }}
        />
        {/* Sun body */}
        <div
          className="h-10 w-10 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 35% 35%, #ffe066, #ffb020, #ff8800)",
            boxShadow:
              "0 0 18px rgba(255,170,50,0.5), 0 0 45px rgba(255,140,50,0.2)",
          }}
        />
      </motion.div>

      {/* ── Daylight wash — warm tint during day half ── */}
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: [0, 0.5, 0.6, 0.5, 0, 0, 0] }}
        transition={{
          duration: DUR,
          times: [0, 0.1, 0.25, 0.4, 0.5, 0.75, 1],
          repeat: Infinity,
        }}
        style={{
          background:
            "linear-gradient(to top, rgba(255,170,60,0.025) 0%, rgba(255,140,80,0.01) 40%, transparent 70%)",
        }}
      />

      {/* ── Moon — arcs during NIGHT half (50% → 100%) ── */}
      <motion.div
        className="absolute"
        animate={{
          //          ──day──             rise        peak        set       back to start
          left: ["103%", "103%", "-3%", "18%", "50%", "82%", "103%"],
          top: ["68%", "68%", "68%", "10%", "3%", "10%", "68%"],
          opacity: [0, 0, 0, 0.95, 1, 0.95, 0],
        }}
        transition={{
          duration: DUR,
          times: [0, 0.25, 0.5, 0.6, 0.75, 0.9, 1],
          ease: "linear",
          repeat: Infinity,
        }}
      >
        {/* Moon glow */}
        <div
          className="absolute left-1/2 top-1/2 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(160,180,230,0.07) 0%, rgba(160,180,230,0.02) 40%, transparent 70%)",
          }}
        />
        {/* Moon body — SVG crescent */}
        <svg width="28" height="28" viewBox="0 0 28 28" className="relative">
          <defs>
            <mask id="crescent-mask">
              <circle cx="14" cy="14" r="12" fill="white" />
              <circle cx="20" cy="10" r="10.5" fill="black" />
            </mask>
          </defs>
          <circle
            cx="14"
            cy="14"
            r="12"
            fill="#dfe3f0"
            mask="url(#crescent-mask)"
            style={{
              filter:
                "drop-shadow(0 0 6px rgba(180,200,240,0.4)) drop-shadow(0 0 18px rgba(180,200,240,0.15))",
            }}
          />
        </svg>
      </motion.div>

      {/* ── Moonlight wash — cool tint during night half ── */}
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: [0, 0, 0, 0.6, 1, 0.6, 0] }}
        transition={{
          duration: DUR,
          times: [0, 0.25, 0.5, 0.6, 0.75, 0.9, 1],
          repeat: Infinity,
        }}
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(100,140,200,0.025) 0%, transparent 60%)",
        }}
      />
    </div>
  );
}

/* ================================================================== */
/*  SVG Beams                                                           */
/* ================================================================== */

function BeamOverlay({
  phases,
  agents,
}: {
  phases: AgentPhase[];
  agents: AgentDef[];
}) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        <filter id="beam-glow">
          <feGaussianBlur stdDeviation="0.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {agents.map((agent, i) => {
        const visible = phases[i] !== "hidden";
        const active = phases[i] === "active";
        const completing = phases[i] === "completing";
        return (
          <g key={agent.id}>
            <motion.path
              d={BEAM_PATHS[i]}
              stroke={agent.color}
              strokeWidth="1.2"
              fill="none"
              filter="url(#beam-glow)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: visible ? 1 : 0,
                opacity: completing ? 0 : visible ? 0.12 : 0,
              }}
              transition={{
                pathLength: { duration: 0.8, ease: "easeOut" },
                opacity: { duration: completing ? 0.6 : 0.3 },
              }}
            />
            <motion.path
              d={BEAM_PATHS[i]}
              stroke={agent.color}
              strokeWidth="0.15"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: visible ? 1 : 0,
                opacity: completing ? 0 : visible ? 0.55 : 0,
              }}
              transition={{
                pathLength: { duration: 0.8, ease: "easeOut" },
                opacity: { duration: completing ? 0.6 : 0.3 },
              }}
            />
            <motion.path
              d={BEAM_PATHS[i]}
              stroke={agent.color}
              strokeWidth="0.25"
              fill="none"
              strokeDasharray="0.6 4.4"
              animate={{
                strokeDashoffset: active ? [0, -5] : 0,
                opacity: active ? 0.75 : 0,
              }}
              transition={{
                strokeDashoffset: {
                  duration: 1,
                  repeat: Infinity,
                  ease: "linear",
                },
                opacity: { duration: 0.3 },
              }}
            />
          </g>
        );
      })}
    </svg>
  );
}

/* ================================================================== */
/*  CEO Card                                                            */
/* ================================================================== */

function CeoCard({
  activated,
  onActivate,
  logEntries,
  statusMsg,
  labels,
}: {
  activated: boolean;
  onActivate: () => void;
  logEntries: string[];
  statusMsg: string;
  labels: {
    ceoAgent: string;
    root: string;
    alwaysOn: string;
    autonomousExplore: string;
  };
}) {
  return (
    <div style={{ perspective: 1200 }}>
      <motion.div
        animate={{ rotateY: activated ? -6 : 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 25 }}
        style={{ transformOrigin: "center center" }}
      >
        <div
          className="relative overflow-hidden rounded-xl"
          style={{
            background: "rgba(12, 13, 20, 0.9)",
            backdropFilter: "blur(20px)",
            boxShadow: activated
              ? "0 0 40px rgba(245,158,11,0.1), 0 0 80px rgba(245,158,11,0.04), 0 8px 32px rgba(0,0,0,0.4)"
              : "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-amber-400/20" />
          <div className="pointer-events-none absolute inset-0 rounded-xl border border-amber-500/15" />
          <div
            className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: ART_DECO, backgroundSize: "60px 60px" }}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-400/[0.04]" />

          <div className="relative p-5">
            <div className="flex items-center gap-3.5">
              <div className="relative shrink-0">
                {activated && (
                  <motion.div
                    className="absolute -inset-1.5 rounded-full"
                    animate={{
                      boxShadow: [
                        "0 0 0 0 rgba(245,158,11,0)",
                        "0 0 0 4px rgba(245,158,11,0.12)",
                        "0 0 0 0 rgba(245,158,11,0)",
                      ],
                    }}
                    transition={{
                      duration: 2.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                )}
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-rose-400 ring-1 ring-amber-400/25">
                  <span className="text-lg">{"\u{1F9E0}"}</span>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-amber-500 ring-[1.5px] ring-black">
                  <Crown className="h-2.5 w-2.5 text-white" />
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-neutral-100">
                    {labels.ceoAgent}
                  </span>
                  <span className="rounded-sm bg-amber-500/10 px-1.5 py-px text-[9px] font-medium uppercase tracking-wider text-amber-400">
                    {labels.root}
                  </span>
                  {activated && <Sparkles className="h-3 w-3 text-amber-400" />}
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={statusMsg}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25 }}
                    className="mt-0.5 text-[11px] text-neutral-500"
                  >
                    {statusMsg}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

            {/* Thinking Log — night phase only */}
            <AnimatePresence>
              {logEntries.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mt-3 space-y-1.5 border-t border-amber-500/10 pt-3"
                >
                  {logEntries.map((entry, i) => (
                    <motion.div
                      key={`${i}-${entry}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25 }}
                      className="flex items-start gap-1.5"
                    >
                      <span className="mt-px font-mono text-[10px] text-amber-500/50">
                        {"\u203A"}
                      </span>
                      <span
                        className={`font-mono text-[10px] leading-relaxed ${
                          entry.startsWith("\u201C") ||
                          entry.startsWith("\u201D")
                            ? "text-amber-300/60"
                            : entry.includes("Dispatching")
                              ? "text-violet-300/60"
                              : "text-neutral-500"
                        }`}
                      >
                        {entry}
                      </span>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Toggle */}
            <div className="mt-4">
              <button
                onClick={activated ? undefined : onActivate}
                disabled={activated}
                className="group relative flex items-center gap-3"
              >
                {!activated && (
                  <motion.div
                    className="absolute -inset-1 rounded-full"
                    animate={{
                      boxShadow: [
                        "0 0 0 0 rgba(245,158,11,0)",
                        "0 0 0 4px rgba(245,158,11,0.08)",
                        "0 0 0 0 rgba(245,158,11,0)",
                      ],
                    }}
                    transition={{
                      duration: 2.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                )}
                <div
                  className={`relative h-6 w-11 rounded-full transition-colors duration-300 ${
                    activated
                      ? "bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.35)]"
                      : "bg-neutral-700 group-hover:bg-neutral-600"
                  }`}
                >
                  <motion.div
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm"
                    animate={{ x: activated ? 22 : 2 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </div>
                <span
                  className={`text-[12px] font-medium ${
                    activated
                      ? "text-amber-400"
                      : "text-neutral-500 group-hover:text-neutral-300"
                  }`}
                >
                  {activated ? labels.alwaysOn : labels.autonomousExplore}
                </span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ================================================================== */
/*  Day Chat Bubble — user messages during daytime                      */
/* ================================================================== */

function DayChatBubble({ text, youLabel }: { text: string; youLabel: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20, scale: 0.92 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -12, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 180, damping: 20 }}
      className="rounded-lg px-3.5 py-2.5"
      style={{
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <div className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-indigo-400 to-cyan-400" />
        <span className="text-[10px] font-medium text-neutral-500">
          {youLabel}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-neutral-300">{text}</p>
    </motion.div>
  );
}

/* ================================================================== */
/*  Agent Card                                                          */
/* ================================================================== */

function AgentCard({
  agent,
  phase,
  labels,
}: {
  agent: AgentDef;
  phase: AgentPhase;
  labels: { working: string; done: string };
}) {
  const visible = phase === "active" || phase === "completing";
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (phase === "active") {
      setVisibleLines(0);
      const t1 = setTimeout(() => setVisibleLines(1), 500);
      const t2 = setTimeout(() => setVisibleLines(2), 1400);
      const t3 = setTimeout(() => setVisibleLines(3), 2300);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
    if (phase === "hidden") setVisibleLines(0);
  }, [phase]);

  return (
    <div style={{ perspective: 1200 }}>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, rotateY: -25, scale: 0.8, x: -20 }}
            animate={{ opacity: 1, rotateY: 5, scale: 1, x: 0 }}
            exit={{ opacity: 0, rotateY: 18, scale: 0.88, x: -12 }}
            transition={{ type: "spring", stiffness: 160, damping: 18 }}
            style={{ transformOrigin: "left center" }}
          >
            <div
              className="relative overflow-hidden rounded-lg"
              style={{
                background: "rgba(12, 13, 20, 0.85)",
                backdropFilter: "blur(14px)",
                boxShadow: `0 0 25px ${agent.color}15, 0 4px 24px rgba(0,0,0,0.35)`,
                border: `1px solid ${agent.color}30`,
              }}
            >
              <div
                className="absolute inset-x-0 top-0 h-px"
                style={{
                  background: `linear-gradient(90deg, transparent, ${agent.color}60, transparent)`,
                }}
              />
              <div className="relative p-3.5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-xl">{agent.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4
                        className="text-[13px] font-semibold"
                        style={{ color: agent.color }}
                      >
                        {agent.name}
                      </h4>
                      <AnimatePresence mode="wait">
                        {phase === "completing" ? (
                          <motion.span
                            key="done"
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400"
                          >
                            <Check className="h-2.5 w-2.5" /> {labels.done}
                          </motion.span>
                        ) : (
                          <motion.span
                            key="working"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-neutral-500"
                          >
                            {labels.working}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                    <p className="mt-0.5 font-mono text-[10px] text-neutral-500">
                      {phase === "completing" ? agent.result : agent.task}
                    </p>
                  </div>
                </div>
                {phase === "active" && visibleLines > 0 && (
                  <div className="mt-2 space-y-0.5 rounded bg-black/30 px-2 py-1.5">
                    {agent.lines.slice(0, visibleLines).map((line, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2 }}
                        className="font-mono text-[9px] leading-relaxed"
                      >
                        <span className="text-neutral-700">$ </span>
                        <span className="text-neutral-400">{line}</span>
                      </motion.div>
                    ))}
                  </div>
                )}
                <div className="mt-2.5 h-0.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  {phase === "active" ? (
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${agent.color}50, ${agent.color})`,
                      }}
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 3.5, ease: "linear" }}
                    />
                  ) : (
                    <div
                      className="h-full w-full rounded-full"
                      style={{ background: agent.color, opacity: 0.4 }}
                    />
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ================================================================== */
/*  Bottom Feed                                                         */
/* ================================================================== */

function BottomFeed({
  isNight,
  results,
  visibleResults,
  round,
  totalCompleted,
  tasksDoneLabel,
}: {
  isNight: boolean;
  results: string[];
  visibleResults: number;
  round: number;
  totalCompleted: number;
  tasksDoneLabel: string;
}) {
  return (
    <div className="space-y-3">
      {/* Results — night only */}
      <div className="flex min-h-[18px] flex-wrap gap-x-5 gap-y-1">
        <AnimatePresence>
          {isNight &&
            results.slice(0, visibleResults).map((result) => (
              <motion.div
                key={result}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-1.5 text-[11px]"
              >
                <span className="text-emerald-400/80">{"\u2713"}</span>
                <span className="font-mono text-neutral-500">{result}</span>
              </motion.div>
            ))}
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-4">
        <AnimatePresence mode="wait">
          {isNight ? (
            <motion.span
              key="night"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="shrink-0 font-mono text-[11px] text-indigo-400/60"
            >
              {"\u{1F319}"} 22:00
            </motion.span>
          ) : (
            <motion.span
              key="day"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="shrink-0 font-mono text-[11px] text-amber-400/60"
            >
              {"\u2600\uFE0F"} 09:00
            </motion.span>
          )}
        </AnimatePresence>

        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
          <motion.div
            key={round}
            className={`h-full rounded-full ${
              isNight
                ? "bg-gradient-to-r from-indigo-500/50 via-violet-500/60 to-amber-500/50"
                : "bg-gradient-to-r from-amber-500/40 via-orange-400/50 to-rose-400/40"
            }`}
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: DUR, ease: "linear" }}
          />
        </div>

        <AnimatePresence mode="wait">
          {isNight ? (
            <motion.span
              key="night-end"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="shrink-0 font-mono text-[11px] text-amber-400/60"
            >
              06:00
            </motion.span>
          ) : (
            <motion.span
              key="day-end"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="shrink-0 font-mono text-[11px] text-indigo-400/60"
            >
              22:00
            </motion.span>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {totalCompleted > 0 && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="shrink-0 text-[11px] font-medium text-amber-400/80"
            >
              {tasksDoneLabel}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Main Section                                                        */
/* ================================================================== */

export function AutonomousExploration() {
  const { t } = useTranslation();
  const [activated, setActivated] = useState(false);
  const [round, setRound] = useState(0);
  const [isNight, setIsNight] = useState(false);
  const [phases, setPhases] = useState<AgentPhase[]>(
    Array.from({ length: 4 }, () => "hidden" as const),
  );
  const [logEntries, setLogEntries] = useState<string[]>([]);
  const [visibleChats, setVisibleChats] = useState(0);
  const [ceoMsg, setCeoMsg] = useState(
    t("landing.v2.exploration.ceo.goodMorning"),
  );
  const [visibleResults, setVisibleResults] = useState(0);
  const [totalCompleted, setTotalCompleted] = useState(0);

  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: true, margin: "-80px" });
  const autoRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const scenarios: Scenario[] = useMemo(() => {
    const translated = t("landing.v2.exploration.scenarios", {
      returnObjects: true,
    }) as TranslatedScenario[];
    return SCENARIO_AGENT_STATIC.map((agentStatic, i) => ({
      dayChat: translated[i].dayChat,
      ceoLog: translated[i].ceoLog,
      agents: agentStatic.map((a, j) => ({
        ...a,
        name: translated[i].agentNames[j],
        task: translated[i].agentTasks[j],
        result: translated[i].agentResults[j],
      })),
      results: translated[i].results,
    }));
  }, [t]);

  const scenarioIdx = round % SCENARIO_COUNT;
  const scenario = scenarios[scenarioIdx];

  // Auto-play after 2s in viewport
  useEffect(() => {
    if (inView && !activated) {
      autoRef.current = setTimeout(() => setActivated(true), 2000);
    }
    return () => clearTimeout(autoRef.current);
  }, [inView, activated]);

  const handleActivate = useCallback(() => {
    clearTimeout(autoRef.current);
    setActivated(true);
  }, []);

  // ── Full day + night cycle ──
  useEffect(() => {
    if (!activated) return;

    const sc = scenarios[round % SCENARIO_COUNT];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const delay = (fn: () => void, ms: number) => {
      timers.push(setTimeout(fn, ms));
    };

    // ── Reset ──
    setPhases(Array.from({ length: 4 }, () => "hidden" as const));
    setLogEntries([]);
    setVisibleResults(0);
    setIsNight(false);
    setVisibleChats(0);

    // ════════════════════════════════════════
    //  DAY PHASE  (0 – 9 s)
    // ════════════════════════════════════════
    setCeoMsg(
      totalCompleted > 0
        ? t("landing.v2.exploration.ceo.overnightDone", {
            count: totalCompleted,
          })
        : t("landing.v2.exploration.ceo.goodMorning"),
    );

    // Chat bubbles appear one by one
    delay(() => setVisibleChats(1), 600);
    delay(() => setCeoMsg(t("landing.v2.exploration.ceo.listening")), 1200);
    delay(() => setVisibleChats(2), 2200);
    delay(() => setVisibleChats(3), 3800);
    delay(
      () =>
        setCeoMsg(
          t("landing.v2.exploration.ceo.noted", {
            snippet: sc.dayChat[0].slice(0, 28),
          }),
        ),
      4200,
    );
    delay(() => setVisibleChats(4), 5400);
    delay(() => setCeoMsg(t("landing.v2.exploration.ceo.buildingPlan")), 7000);

    // Fade chat bubbles
    delay(() => setVisibleChats(0), 8500);

    // ════════════════════════════════════════
    //  TRANSITION  DAY → NIGHT  (9 – 10.5 s)
    // ════════════════════════════════════════
    delay(() => {
      setIsNight(true);
      setCeoMsg(t("landing.v2.exploration.ceo.nightMode"));
    }, 9500);

    // ════════════════════════════════════════
    //  NIGHT PHASE  (10.5 – 19.5 s)
    // ════════════════════════════════════════

    // CEO thinking log
    sc.ceoLog.forEach((entry, i) => {
      delay(() => setLogEntries((prev) => [...prev, entry]), 10200 + i * 700);
    });

    // Dispatch agents
    sc.agents.forEach((_, i) => {
      const dispatch = 13200 + i * 600;
      const active = dispatch + 450;
      const complete = 16800 + i * 350;
      const hide = complete + 800;

      delay(
        () =>
          setPhases((p) => {
            const n = [...p];
            n[i] = "beaming";
            return n;
          }),
        dispatch,
      );
      delay(
        () =>
          setPhases((p) => {
            const n = [...p];
            n[i] = "active";
            return n;
          }),
        active,
      );
      delay(
        () =>
          setPhases((p) => {
            const n = [...p];
            n[i] = "completing";
            return n;
          }),
        complete,
      );
      delay(
        () =>
          setPhases((p) => {
            const n = [...p];
            n[i] = "hidden";
            return n;
          }),
        hide,
      );
    });

    // Results
    sc.results.forEach((_, i) => {
      delay(() => setVisibleResults(i + 1), 17000 + i * 300);
    });

    // Wrap up night
    delay(() => {
      setCeoMsg(t("landing.v2.exploration.ceo.allCompleted"));
      setTotalCompleted((prev) => prev + sc.results.length);
    }, 18500);

    // ════════════════════════════════════════
    //  TRANSITION  NIGHT → DAY  (19.5 s)
    // ════════════════════════════════════════
    delay(() => {
      setIsNight(false);
      setLogEntries([]);
      setVisibleResults(0);
    }, 19500);

    // Next round
    delay(() => setRound((r) => r + 1), CYCLE_DURATION);

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activated, round, scenarios, t]);

  return (
    <section
      id="autonomous-exploration"
      ref={sectionRef}
      className="relative flex min-h-[100dvh] flex-col overflow-hidden"
    >
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -left-[15%] top-[25%] h-[50vh] w-[50vh] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.05),transparent_70%)] blur-3xl" />
      <div className="pointer-events-none absolute -right-[10%] top-[55%] h-[40vh] w-[40vh] rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.04),transparent_70%)] blur-3xl" />

      <div className="pointer-events-none absolute left-1/2 top-0 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/70" />

      {/* Celestial — continuous loop, never remounts */}
      <CelestialCycle activated={activated} />

      {/* ── Title ── */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.8 }}
        className="relative z-10 px-6 pt-28 text-center"
      >
        <span className="mb-5 inline-block rounded-full border border-violet-500/20 bg-violet-500/[0.06] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[3px] text-violet-400 backdrop-blur-sm">
          {t("landing.v2.exploration.badge")}
        </span>
        <h2 className="mb-4 text-3xl font-extrabold tracking-tight md:text-5xl">
          <span className="bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
            {t("landing.v2.exploration.title1")}
          </span>
          <br />
          <span className="bg-gradient-to-r from-violet-300 to-amber-300 bg-clip-text text-transparent">
            {t("landing.v2.exploration.title2")}
          </span>
        </h2>
        <p className="mx-auto max-w-xl text-[15px] text-neutral-500">
          {t("landing.v2.exploration.subtitle")}
        </p>
      </motion.div>

      {/* ── Stage ── */}
      <div className="relative z-0 mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <BeamOverlay phases={phases} agents={scenario.agents} />

        {/* CEO card — always visible */}
        <div className="absolute left-[4%] top-1/2 z-[2] w-[280px] -translate-y-1/2 md:left-[6%] md:w-[300px]">
          <CeoCard
            activated={activated}
            onActivate={handleActivate}
            logEntries={logEntries}
            statusMsg={ceoMsg}
            labels={{
              ceoAgent: t("landing.v2.exploration.ceoAgent"),
              root: t("landing.v2.exploration.root"),
              alwaysOn: t("landing.v2.exploration.alwaysOn"),
              autonomousExplore: t("landing.v2.exploration.autonomousExplore"),
            }}
          />
        </div>

        {/* Day: chat bubbles  /  Night: agent cards — same positions */}
        <AnimatePresence mode="wait">
          {!isNight
            ? // ── Day: user chat context ──
              scenario.dayChat.slice(0, visibleChats).map((chat, i) => (
                <div
                  key={`chat-${scenarioIdx}-${i}`}
                  className="absolute z-[2] w-[230px] md:w-[260px]"
                  style={{
                    top: AGENT_POSITIONS[i].top,
                    left: AGENT_POSITIONS[i].left,
                  }}
                >
                  <DayChatBubble
                    text={chat}
                    youLabel={t("landing.v2.exploration.you")}
                  />
                </div>
              ))
            : // ── Night: agent cards ──
              scenario.agents.map((agent, i) => (
                <div
                  key={`agent-${scenarioIdx}-${agent.id}`}
                  className="absolute z-[2] w-[220px] md:w-[260px]"
                  style={{
                    top: AGENT_POSITIONS[i].top,
                    left: AGENT_POSITIONS[i].left,
                  }}
                >
                  <AgentCard
                    agent={agent}
                    phase={phases[i]}
                    labels={{
                      working: t("landing.v2.exploration.working"),
                      done: t("landing.v2.exploration.done"),
                    }}
                  />
                </div>
              ))}
        </AnimatePresence>
      </div>

      {/* ── Bottom ── */}
      <div className="relative z-10 mx-auto w-full max-w-3xl px-8 pb-8">
        <AnimatePresence>
          {activated && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <BottomFeed
                isNight={isNight}
                results={scenario.results}
                visibleResults={visibleResults}
                round={round}
                totalCompleted={totalCompleted}
                tasksDoneLabel={t("landing.v2.exploration.tasksDone", {
                  count: totalCompleted,
                })}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {!activated && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            className="text-center text-xs text-neutral-600"
          >
            {t("landing.v2.exploration.toggleHint")}
          </motion.p>
        )}
      </div>
    </section>
  );
}
