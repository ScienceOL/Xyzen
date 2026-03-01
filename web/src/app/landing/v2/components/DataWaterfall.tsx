import { useMemo } from "react";

/* ------------------------------------------------------------------ */
/*  Pure CSS data waterfall — right side of hero, flows UPWARD         */
/*  Agent transactions, messages, API calls — warm amber/violet tones  */
/*  Zero WebGL cost, mirrors CodeWaterfall structure                    */
/* ------------------------------------------------------------------ */

const DATA_FRAGMENTS = [
  "→ SEO Optimizer called you",
  "  +$0.42  ✓ completed",
  '{ from: "Translator", to: "Legal" }',
  "agent.publish({ skills: 3 })",
  "◆ new listing: Watercolor AI",
  "  earning: $12.40/day",
  'POST /agents/invoke { id: "quant" }',
  "← result: { confidence: 0.97 }",
  'marketplace.search("code review")',
  "  found: 14 agents, avg $0.08/call",
  "⚡ SaaS Builder → Copywriter",
  "  tokens: 1,247  cost: $0.03",
  "event: agent_economy.transfer",
  '  { amount: 0.15, currency: "USD" }',
  'skill.register("data-analysis")',
  "  reputation: ★★★★☆ (4.2)",
  "ws://network/agents/stream",
  "  connected: 847 agents online",
  "tx_hash: 0xa7f3...2e91",
  "  status: confirmed ✓",
  "agent.earn({ passive: true })",
  "  weekly: $47.83 (+12%)",
  "GET /economy/leaderboard",
  "  #1 SEO Optimizer — 2,847 calls",
  "collaboration.start({",
  '  agents: ["debug", "fix", "test"],',
  '  task: "memory-leak-hunt"',
  "})",
  "reward: +0.25 reputation",
  "federation.sync({ peers: 12 })",
];

interface Stream {
  x: number;
  speed: number;
  delay: number;
  opacity: number;
  lines: string[];
}

function buildStreams(count: number): Stream[] {
  const streams: Stream[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor(Math.random() * DATA_FRAGMENTS.length);
    const len = 8 + Math.floor(Math.random() * 12);
    const lines: string[] = [];
    for (let j = 0; j < len; j++) {
      lines.push(DATA_FRAGMENTS[(start + j) % DATA_FRAGMENTS.length]);
    }

    streams.push({
      x: 5 + (i / count) * 35,
      speed: 14 + Math.random() * 10,
      delay: Math.random() * -15,
      opacity: 0.1 + Math.random() * 0.1,
      lines,
    });
  }
  return streams;
}

export function DataWaterfall() {
  const streams = useMemo(() => buildStreams(6), []);

  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 w-[42%] overflow-hidden">
      {/* Fade mask — soften edges (left=inner fades to center, right=outer fades out) */}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black" />

      {streams.map((stream, i) => (
        <div
          key={i}
          className="absolute whitespace-pre text-right font-mono text-[10px] leading-[1.6] text-amber-400/80"
          style={{
            right: `${stream.x}%`,
            opacity: stream.opacity,
            animation: `data-scroll-up ${stream.speed}s linear ${stream.delay}s infinite`,
          }}
        >
          {stream.lines.join("\n")}
        </div>
      ))}

      {/* Inject keyframes — flows upward */}
      <style>{`
        @keyframes data-scroll-up {
          0% { transform: translateY(100vh); }
          100% { transform: translateY(-100%); }
        }
      `}</style>
    </div>
  );
}
