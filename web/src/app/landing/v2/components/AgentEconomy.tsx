import { motion, AnimatePresence, useInView } from "motion/react";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

/* ================================================================== */
/*  Agent network — concrete, vertical-domain agents                   */
/* ================================================================== */

interface AgentNode {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** position as % of the network stage */
  x: number;
  y: number;
}

const AGENT_STATIC = [
  { id: "yours", icon: "\u{1F50D}", color: "#F59E0B", x: 20, y: 45 },
  { id: "saas", icon: "\u{1F3D7}\uFE0F", color: "#F43F5E", x: 8, y: 18 },
  { id: "watercolor", icon: "\u{1F3A8}", color: "#A78BFA", x: 86, y: 16 },
  { id: "timeseries", icon: "\u{1F4C8}", color: "#06B6D4", x: 88, y: 55 },
  { id: "legal", icon: "\u2696\uFE0F", color: "#8B5CF6", x: 76, y: 85 },
  { id: "translator", icon: "\u{1F310}", color: "#10B981", x: 46, y: 86 },
  { id: "copywriter", icon: "\u270D\uFE0F", color: "#FB923C", x: 62, y: 44 },
  { id: "quant", icon: "\u{1F4B9}", color: "#EC4899", x: 38, y: 64 },
] as const;

/** Directed edges: [source, target] */
const EDGES: [string, string][] = [
  // Income → "yours" receives payment
  ["saas", "yours"],
  ["watercolor", "yours"],
  ["legal", "yours"],
  ["timeseries", "yours"],
  ["copywriter", "yours"],
  ["quant", "yours"],
  // Expense → "yours" pays out
  ["yours", "translator"],
  // Inter-agent economy
  ["saas", "copywriter"],
  ["translator", "legal"],
  ["timeseries", "saas"],
  ["watercolor", "copywriter"],
  ["legal", "timeseries"],
  ["copywriter", "translator"],
  ["watercolor", "saas"],
  ["quant", "timeseries"],
  ["quant", "legal"],
];

const INCOME_EDGES = EDGES.filter(([, to]) => to === "yours");
const OTHER_EDGES = EDGES.filter(([, to]) => to !== "yours");

/* ================================================================== */
/*  Types                                                               */
/* ================================================================== */

interface TxRecord {
  id: number;
  fromAgent: AgentNode;
  amount: number;
}

interface Particle {
  id: number;
  sourceId: string;
  targetId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  amount: number;
  edgeKey: string;
}

interface Popup {
  id: number;
  x: number;
  y: number;
  amount: number;
}

/* ================================================================== */
/*  Network node                                                        */
/* ================================================================== */

function NetworkNode({
  agent,
  isPulsing,
  youLabel,
}: {
  agent: AgentNode;
  isPulsing: boolean;
  youLabel: string;
}) {
  const isYours = agent.id === "yours";

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${agent.x}%`, top: `${agent.y}%` }}
    >
      <motion.div
        animate={isPulsing ? { scale: [1, 1.35, 1] } : { scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative"
      >
        {/* Ambient pulse ring — "yours" only */}
        {isYours && (
          <motion.div
            className="absolute -inset-2.5 rounded-full"
            animate={{
              boxShadow: [
                "0 0 0 0 rgba(245,158,11,0)",
                "0 0 0 5px rgba(245,158,11,0.12)",
                "0 0 0 0 rgba(245,158,11,0)",
              ],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}

        {/* Ripple ring on transaction receive */}
        <AnimatePresence>
          {isPulsing && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ border: `1.5px solid ${agent.color}` }}
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 3, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>

        {/* Circle */}
        <div
          className={`flex items-center justify-center rounded-full transition-shadow duration-300 ${
            isYours ? "h-11 w-11 md:h-14 md:w-14" : "h-9 w-9 md:h-12 md:w-12"
          }`}
          style={{
            backgroundColor: agent.color + "1A",
            border: `1.5px solid ${agent.color}${isYours ? "55" : "30"}`,
            boxShadow: isPulsing
              ? `0 0 28px ${agent.color}50, 0 0 56px ${agent.color}20`
              : isYours
                ? `0 0 20px ${agent.color}18`
                : "none",
          }}
        >
          <span
            className={isYours ? "text-lg md:text-xl" : "text-base md:text-lg"}
          >
            {agent.icon}
          </span>
        </div>

        {/* YOU badge */}
        {isYours && (
          <div className="absolute -bottom-0.5 -right-2 rounded-sm bg-amber-500 px-1.5 py-px text-[8px] font-extrabold tracking-wide text-white shadow-[0_0_10px_rgba(245,158,11,0.5)]">
            {youLabel}
          </div>
        )}
      </motion.div>

      {/* Label — hidden on mobile for non-yours, compact on small screens */}
      <p
        className={`absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-medium backdrop-blur-sm md:mt-2 md:text-[11px] ${
          isYours
            ? "bg-amber-500/10 text-amber-400/90"
            : "hidden bg-black/50 text-neutral-500 md:block"
        }`}
      >
        {agent.name}
      </p>
    </div>
  );
}

/* ================================================================== */
/*  Gold particle                                                       */
/* ================================================================== */

function GoldParticle({
  particle,
  onComplete,
}: {
  particle: Particle;
  onComplete: () => void;
}) {
  return (
    <motion.div
      className="pointer-events-none absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        background:
          "radial-gradient(circle, #FBBF24 25%, #F59E0B 55%, transparent 100%)",
        boxShadow:
          "0 0 12px 4px rgba(245,158,11,0.6), 0 0 28px 8px rgba(245,158,11,0.2)",
      }}
      initial={{
        left: `${particle.fromX}%`,
        top: `${particle.fromY}%`,
        scale: 0,
        opacity: 0,
      }}
      animate={{
        left: `${particle.toX}%`,
        top: `${particle.toY}%`,
        scale: [0, 1.5, 1.2, 0.5],
        opacity: [0, 1, 0.9, 0.15],
      }}
      transition={{ duration: 1.05, ease: [0.4, 0, 0.2, 1] }}
      onAnimationComplete={onComplete}
    />
  );
}

/* ================================================================== */
/*  Earning popup (+$X.XX float-up)                                     */
/* ================================================================== */

function EarningPopupEl({ popup }: { popup: Popup }) {
  return (
    <motion.div
      className="pointer-events-none absolute z-30 -translate-x-1/2 select-none font-mono text-[12px] font-bold text-amber-400"
      style={{
        left: `${popup.x}%`,
        top: `${popup.y}%`,
        textShadow: "0 0 10px rgba(245,158,11,0.6)",
      }}
      initial={{ opacity: 0, y: 0, scale: 0.5 }}
      animate={{
        opacity: [0, 1, 1, 0],
        y: -42,
        scale: [0.5, 1.15, 1, 0.9],
      }}
      transition={{ duration: 1.5, ease: "easeOut" }}
    >
      +${popup.amount.toFixed(2)}
    </motion.div>
  );
}

/* ================================================================== */
/*  Main component                                                      */
/* ================================================================== */

export function AgentEconomy() {
  const { t } = useTranslation();
  const [earnings, setEarnings] = useState(47.83);
  const [totalCalls, setTotalCalls] = useState(142);
  const [transactions, setTransactions] = useState<TxRecord[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [pulsingNodes, setPulsingNodes] = useState<Set<string>>(new Set());
  const [popups, setPopups] = useState<Popup[]>([]);
  const [activeEdges, setActiveEdges] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, margin: "-80px" });
  const idRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const networkAgents: AgentNode[] = useMemo(
    () =>
      AGENT_STATIC.map((s) => ({
        ...s,
        name: t(`landing.v2.economy.agents.${s.id}`),
      })),
    [t],
  );
  const agentMap = useMemo(
    () => new Map(networkAgents.map((a) => [a.id, a])),
    [networkAgents],
  );

  const nextId = useCallback(() => ++idRef.current, []);

  const safeTimeout = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timeoutsRef.current.delete(t);
      fn();
    }, ms);
    timeoutsRef.current.add(t);
    return t;
  }, []);

  /* ── Handle particle arrival ── */
  const handleParticleComplete = useCallback(
    (particle: Particle) => {
      setParticles((prev) => prev.filter((p) => p.id !== particle.id));

      // Pulse target
      setPulsingNodes((prev) => new Set(prev).add(particle.targetId));
      safeTimeout(() => {
        setPulsingNodes((prev) => {
          const next = new Set(prev);
          next.delete(particle.targetId);
          return next;
        });
      }, 600);

      // Income to "yours"
      if (particle.targetId === "yours") {
        setEarnings((prev) => Math.round((prev + particle.amount) * 100) / 100);
        setTotalCalls((prev) => prev + 1);

        // Popup
        const popupId = nextId();
        const target = agentMap.get("yours")!;
        setPopups((prev) => [
          ...prev.slice(-3),
          {
            id: popupId,
            x: target.x,
            y: target.y - 8,
            amount: particle.amount,
          },
        ]);
        safeTimeout(() => {
          setPopups((prev) => prev.filter((p) => p.id !== popupId));
        }, 1600);

        // Transaction log
        const source = agentMap.get(particle.sourceId)!;
        setTransactions((prev) =>
          [
            { id: particle.id, fromAgent: source, amount: particle.amount },
            ...prev,
          ].slice(0, 6),
        );
      }
    },
    [nextId, safeTimeout, agentMap],
  );

  /* ── Spawn a transaction ── */
  const spawnTransaction = useCallback(() => {
    const roll = Math.random();
    const edge =
      roll < 0.45
        ? INCOME_EDGES[Math.floor(Math.random() * INCOME_EDGES.length)]
        : OTHER_EDGES[Math.floor(Math.random() * OTHER_EDGES.length)];

    const [fromId, toId] = edge;
    const from = agentMap.get(fromId)!;
    const to = agentMap.get(toId)!;
    const amount = Math.round((Math.random() * 0.09 + 0.01) * 100) / 100;
    const edgeKey = `${fromId}-${toId}`;
    const id = nextId();

    setParticles((prev) => [
      ...prev,
      {
        id,
        sourceId: fromId,
        targetId: toId,
        fromX: from.x,
        fromY: from.y,
        toX: to.x,
        toY: to.y,
        amount,
        edgeKey,
      },
    ]);

    setActiveEdges((prev) => new Set(prev).add(edgeKey));
    safeTimeout(() => {
      setActiveEdges((prev) => {
        const next = new Set(prev);
        next.delete(edgeKey);
        return next;
      });
    }, 1250);
  }, [nextId, safeTimeout, agentMap]);

  /* ── Auto-play loop ── */
  useEffect(() => {
    if (!inView) return;

    const start = safeTimeout(() => {
      spawnTransaction();
      intervalRef.current = setInterval(spawnTransaction, 1500);
    }, 2000);

    return () => {
      clearTimeout(start);
      if (intervalRef.current) clearInterval(intervalRef.current);
      timeoutsRef.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <section id="agent-economy" className="relative px-6 py-12 md:py-16">
      {/* Section divider glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
      {/* Top/bottom fade — blends with adjacent sections */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/60" />

      {/* Ambient atmosphere */}
      <div className="pointer-events-none absolute -left-[10%] top-[15%] h-[50vh] w-[50vh] rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.04),transparent_70%)] blur-3xl" />
      <div className="pointer-events-none absolute -right-[10%] bottom-[10%] h-[40vh] w-[40vh] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.04),transparent_70%)] blur-3xl" />

      {/* ── Full-bleed network stage ── */}
      <div
        ref={containerRef}
        className="relative mx-auto min-h-[58vh] max-w-6xl md:min-h-[82vh]"
      >
        {/* SVG edges */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {EDGES.map(([fromId, toId]) => {
            const from = agentMap.get(fromId)!;
            const to = agentMap.get(toId)!;
            const key = `${fromId}-${toId}`;
            const active = activeEdges.has(key);
            return (
              <line
                key={key}
                x1={`${from.x}%`}
                y1={`${from.y}%`}
                x2={`${to.x}%`}
                y2={`${to.y}%`}
                stroke={active ? "#F59E0B" : "white"}
                strokeOpacity={active ? 0.3 : 0.05}
                strokeWidth={active ? 2 : 1}
                style={{
                  transition:
                    "stroke 0.3s ease, stroke-opacity 0.3s ease, stroke-width 0.3s ease",
                }}
              />
            );
          })}
        </svg>

        {/* Agent nodes */}
        {networkAgents.map((agent, i) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, scale: 0 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{
              delay: 0.4 + i * 0.08,
              type: "spring",
              stiffness: 220,
              damping: 16,
            }}
          >
            <NetworkNode
              agent={agent}
              isPulsing={pulsingNodes.has(agent.id)}
              youLabel={t("landing.v2.economy.you")}
            />
          </motion.div>
        ))}

        {/* Gold particles */}
        <AnimatePresence>
          {particles.map((p) => (
            <GoldParticle
              key={p.id}
              particle={p}
              onComplete={() => handleParticleComplete(p)}
            />
          ))}
        </AnimatePresence>

        {/* Earning popups */}
        <AnimatePresence>
          {popups.map((p) => (
            <EarningPopupEl key={p.id} popup={p} />
          ))}
        </AnimatePresence>

        {/* ════════════════════════════════════════════════════════ */}
        {/*  FLOATING OVERLAY: Title — top center                   */}
        {/* ════════════════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8 }}
          className="pointer-events-none absolute inset-x-0 top-0 z-10 pt-1 text-center md:pt-6"
        >
          <span className="mb-3 inline-block rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-[3px] text-amber-400 backdrop-blur-sm md:mb-4 md:px-4 md:py-1.5 md:text-[11px]">
            {t("landing.v2.economy.badge")}
          </span>
          <h2 className="mb-2 text-2xl font-extrabold tracking-tight md:mb-3 md:text-5xl">
            <span className="bg-gradient-to-r from-amber-200 to-orange-300 bg-clip-text text-transparent">
              {t("landing.v2.economy.title1")}
            </span>
            <br />
            <span className="text-white">{t("landing.v2.economy.title2")}</span>
          </h2>
          <p className="mx-auto hidden max-w-lg whitespace-pre-line text-[15px] text-neutral-500 md:block">
            {t("landing.v2.economy.subtitle")}
          </p>
        </motion.div>

        {/* ════════════════════════════════════════════════════════ */}
        {/*  MOBILE: compact bottom bar — subtitle-style             */}
        {/* ════════════════════════════════════════════════════════ */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 md:hidden">
          <div
            style={{
              background:
                "linear-gradient(to bottom, transparent, rgba(0,0,0,0.5) 40%, rgba(0,0,0,0.85) 100%)",
            }}
          >
            <div className="flex items-center justify-between px-4 pb-5 pt-16">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15">
                  <span className="text-xs">{"\u{1F50D}"}</span>
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-neutral-200">
                    {t("landing.v2.economy.agents.yours")}
                  </p>
                  <p className="text-[10px] text-neutral-600">
                    {t("landing.v2.economy.calls", { count: totalCalls })}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <motion.span
                  key={earnings}
                  initial={{ opacity: 0.6 }}
                  animate={{ opacity: 1 }}
                  className="block text-xl font-extrabold tabular-nums"
                >
                  <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
                    ${earnings.toFixed(2)}
                  </span>
                </motion.span>
              </div>
              <span className="flex items-center gap-1 rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                {t("landing.v2.economy.live")}
              </span>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════ */}
        {/*  DESKTOP: full earnings panel — bottom-left              */}
        {/* ════════════════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="absolute bottom-6 left-6 z-10 hidden w-64 rounded-xl border border-white/[0.08] bg-black/70 p-5 backdrop-blur-md md:block"
        >
          {/* Header */}
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/25">
              <span className="text-xs">{"\u{1F50D}"}</span>
            </div>
            <span className="text-[13px] font-semibold text-neutral-200">
              {t("landing.v2.economy.agents.yours")}
            </span>
            <span className="rounded-sm bg-emerald-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-emerald-400">
              {t("landing.v2.economy.live")}
            </span>
          </div>

          {/* Earnings */}
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-neutral-600">
            {t("landing.v2.economy.totalEarned")}
          </p>
          <div className="relative mb-0.5 overflow-hidden">
            <motion.span
              key={earnings}
              initial={{ opacity: 0.6, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="block text-3xl font-extrabold tabular-nums"
            >
              <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
                ${earnings.toFixed(2)}
              </span>
            </motion.span>
          </div>
          <p className="mb-4 text-[11px] text-neutral-600">
            {t("landing.v2.economy.callsThisWeek", { count: totalCalls })}
          </p>

          {/* Divider */}
          <div className="mb-3 h-px bg-gradient-to-r from-white/[0.06] to-transparent" />

          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-neutral-600">
            {t("landing.v2.economy.liveFeed")}
          </p>

          {/* Transaction feed */}
          <div
            className="h-[130px] overflow-hidden"
            style={{
              maskImage:
                "linear-gradient(to bottom, black 60%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black 60%, transparent 100%)",
            }}
          >
            {transactions.map((tx) => (
              <motion.div
                key={tx.id}
                layout="position"
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  layout: { type: "spring", stiffness: 400, damping: 30 },
                  opacity: { duration: 0.25 },
                  x: { type: "spring", stiffness: 400, damping: 30 },
                }}
                className="flex items-center gap-2 py-[3px]"
              >
                <span className="shrink-0 text-xs">{tx.fromAgent.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] text-neutral-400">
                    <span
                      className="font-medium"
                      style={{ color: tx.fromAgent.color }}
                    >
                      {tx.fromAgent.name}
                    </span>{" "}
                    {t("landing.v2.economy.calledYou")}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[11px] font-semibold text-amber-400">
                  +${tx.amount.toFixed(2)}
                </span>
              </motion.div>
            ))}

            {transactions.length === 0 && (
              <p className="py-[3px] text-[11px] italic text-neutral-700">
                {t("landing.v2.economy.waitingForTransactions")}
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
