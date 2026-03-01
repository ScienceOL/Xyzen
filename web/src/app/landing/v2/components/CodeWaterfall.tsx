import { useMemo } from "react";

/* ------------------------------------------------------------------ */
/*  Pure CSS code waterfall — positioned on the left side of hero     */
/*  Zero WebGL cost, great text rendering                             */
/* ------------------------------------------------------------------ */

const CODE_FRAGMENTS = [
  "async function explore() {",
  "  const result = await agent.think()",
  "  return result.insights",
  "}",
  "class SuperBrain {",
  "  private memory: Map<string, any>",
  "  constructor(model: LLM) {",
  "    this.tools = loadAll()",
  "  }",
  "  async execute(task: Task) {",
  "    const plan = this.plan(task)",
  "    for (const step of plan) {",
  "      await this.run(step)",
  "    }",
  "  }",
  "}",
  "import { Agent } from '@xyzen/core'",
  "const agent = new Agent({",
  "  model: 'claude-opus-4-6',",
  "  tools: [search, code, deploy],",
  "  memory: persistent,",
  "})",
  "await agent.learn(feedback)",
  "0x1F4A9 0xDEAD 0xBEEF",
  "SELECT * FROM knowledge",
  "WHERE confidence > 0.95",
  "fn process(input: &str) -> Result",
  "let output = model.generate(prompt)",
  "export default pipeline",
  "127.0.0.1:8080/api/v1/agents",
  "POST /tasks { priority: high }",
  "const skills = agent.getSkills()",
  "await brain.consolidate()",
  "return { success: true, data }",
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
    // Pick a random slice of code fragments
    const start = Math.floor(Math.random() * CODE_FRAGMENTS.length);
    const len = 8 + Math.floor(Math.random() * 12);
    const lines: string[] = [];
    for (let j = 0; j < len; j++) {
      lines.push(CODE_FRAGMENTS[(start + j) % CODE_FRAGMENTS.length]);
    }

    streams.push({
      x: 5 + (i / count) * 35,
      speed: 12 + Math.random() * 10,
      delay: Math.random() * -15,
      opacity: 0.12 + Math.random() * 0.12,
      lines,
    });
  }
  return streams;
}

export function CodeWaterfall() {
  const streams = useMemo(() => buildStreams(7), []);

  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 w-[42%] overflow-hidden">
      {/* Fade mask — soften edges */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black" />
      <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black" />

      {streams.map((stream, i) => (
        <div
          key={i}
          className="absolute whitespace-pre font-mono text-[10px] leading-[1.6] text-blue-400"
          style={{
            left: `${stream.x}%`,
            opacity: stream.opacity,
            animation: `code-scroll ${stream.speed}s linear ${stream.delay}s infinite`,
          }}
        >
          {stream.lines.join("\n")}
        </div>
      ))}

      {/* Inject keyframes */}
      <style>{`
        @keyframes code-scroll {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
      `}</style>
    </div>
  );
}
