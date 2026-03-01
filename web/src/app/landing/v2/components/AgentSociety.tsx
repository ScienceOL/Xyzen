import { useRef, useMemo, useCallback, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

/* ================================================================== */
/*  AGENT SOCIETY v6 — themed levels + knowledge pulse network        */
/*                                                                    */
/*  Each level has a distinct color identity:                         */
/*    Top (research)    = cyan/teal                                   */
/*    Main (work)       = violet/purple                               */
/*    Bottom (market)   = amber/gold                                  */
/*                                                                    */
/*  Knowledge pulses cascade along connection lines.                  */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  Palette                                                           */
/* ------------------------------------------------------------------ */

const C = {
  violet: new THREE.Color("#8B5CF6"),
  rose: new THREE.Color("#F43F5E"),
  amber: new THREE.Color("#F59E0B"),
  cyan: new THREE.Color("#06B6D4"),
  emerald: new THREE.Color("#10B981"),
  pink: new THREE.Color("#EC4899"),
  indigo: new THREE.Color("#818CF8"),
  teal: new THREE.Color("#2DD4BF"),
};

const LEVELS = { bottom: -0.5, main: 0, top: 0.55 };

/* ------------------------------------------------------------------ */
/*  Level themes                                                      */
/* ------------------------------------------------------------------ */

interface LevelTheme {
  y: number;
  gridR: number;
  rings: number;
  radials: number;
  gridColor: string;
  glowColor: string;
  particleColor: string;
  flowSpeed: number;
  flowDir: number;
  ringParticles: number;
}

const LEVEL_CONFIG: LevelTheme[] = [
  {
    y: LEVELS.main,
    gridR: 0.9,
    rings: 4,
    radials: 8,
    gridColor: "#A78BFA",
    glowColor: "#8B5CF6",
    particleColor: "#C4B5FD",
    flowSpeed: 0.3,
    flowDir: 1,
    ringParticles: 60,
  },
  {
    y: LEVELS.top,
    gridR: 0.38,
    rings: 2,
    radials: 6,
    gridColor: "#22D3EE",
    glowColor: "#06B6D4",
    particleColor: "#67E8F9",
    flowSpeed: 0.4,
    flowDir: -1,
    ringParticles: 35,
  },
  {
    y: LEVELS.bottom,
    gridR: 0.5,
    rings: 3,
    radials: 6,
    gridColor: "#FBBF24",
    glowColor: "#F59E0B",
    particleColor: "#FCD34D",
    flowSpeed: 0.25,
    flowDir: 1,
    ringParticles: 40,
  },
];

// Map agent level → theme color for connection lines
const LEVEL_COLOR_MAP: Record<number, THREE.Color> = {
  [LEVELS.main]: new THREE.Color("#A78BFA"),
  [LEVELS.top]: new THREE.Color("#22D3EE"),
  [LEVELS.bottom]: new THREE.Color("#FBBF24"),
};

/* ------------------------------------------------------------------ */
/*  Agent definitions                                                 */
/* ------------------------------------------------------------------ */

interface AgentBase {
  color: THREE.Color;
  size: number;
  level: number;
}
interface Drifter extends AgentBase {
  type: "drifter";
  waypoints: [number, number][];
  speed: number;
}
interface Stationed extends AgentBase {
  type: "stationed";
  pos: [number, number];
  floatSpeed: number;
  floatAmp: number;
  floatPhase: number;
}
type AgentDef = Drifter | Stationed;

const AGENTS: AgentDef[] = [
  {
    type: "stationed",
    pos: [0.45, -0.25],
    size: 0.08,
    color: C.emerald,
    level: LEVELS.main,
    floatSpeed: 1.2,
    floatAmp: 0.04,
    floatPhase: 0,
  },
  {
    type: "stationed",
    pos: [0.62, -0.08],
    size: 0.065,
    color: C.pink,
    level: LEVELS.main,
    floatSpeed: 0.9,
    floatAmp: 0.035,
    floatPhase: 1.5,
  },
  {
    type: "stationed",
    pos: [0.4, -0.02],
    size: 0.055,
    color: C.amber,
    level: LEVELS.main,
    floatSpeed: 1.4,
    floatAmp: 0.03,
    floatPhase: 3.0,
  },
  {
    type: "stationed",
    pos: [-0.55, -0.2],
    size: 0.075,
    color: C.violet,
    level: LEVELS.main,
    floatSpeed: 0.6,
    floatAmp: 0.025,
    floatPhase: 0.5,
  },
  {
    type: "stationed",
    pos: [-0.15, 0.5],
    size: 0.06,
    color: C.cyan,
    level: LEVELS.main,
    floatSpeed: 0.8,
    floatAmp: 0.03,
    floatPhase: 2.2,
  },
  {
    type: "stationed",
    pos: [0.15, -0.55],
    size: 0.07,
    color: C.indigo,
    level: LEVELS.main,
    floatSpeed: 0.7,
    floatAmp: 0.028,
    floatPhase: 4.1,
  },
  {
    type: "drifter",
    waypoints: [
      [-0.7, 0.3],
      [0.3, 0.35],
      [0.6, -0.35],
      [-0.5, -0.45],
    ],
    speed: 0.2,
    size: 0.055,
    color: C.rose,
    level: LEVELS.main,
  },
  {
    type: "drifter",
    waypoints: [
      [0.55, 0.3],
      [-0.35, 0.15],
      [-0.25, -0.5],
      [0.45, -0.25],
    ],
    speed: 0.16,
    size: 0.05,
    color: C.teal,
    level: LEVELS.main,
  },
  {
    type: "stationed",
    pos: [-0.1, -0.08],
    size: 0.07,
    color: C.violet,
    level: LEVELS.top,
    floatSpeed: 0.7,
    floatAmp: 0.04,
    floatPhase: 1.0,
  },
  {
    type: "stationed",
    pos: [0.12, 0.05],
    size: 0.06,
    color: C.cyan,
    level: LEVELS.top,
    floatSpeed: 1.0,
    floatAmp: 0.035,
    floatPhase: 2.8,
  },
  {
    type: "stationed",
    pos: [0.0, 0.18],
    size: 0.075,
    color: C.emerald,
    level: LEVELS.top,
    floatSpeed: 0.55,
    floatAmp: 0.03,
    floatPhase: 0.3,
  },
  {
    type: "stationed",
    pos: [-0.25, 0.0],
    size: 0.065,
    color: C.amber,
    level: LEVELS.bottom,
    floatSpeed: 0.9,
    floatAmp: 0.03,
    floatPhase: 3.5,
  },
  {
    type: "stationed",
    pos: [0.25, 0.05],
    size: 0.06,
    color: C.rose,
    level: LEVELS.bottom,
    floatSpeed: 1.1,
    floatAmp: 0.035,
    floatPhase: 1.8,
  },
  {
    type: "drifter",
    waypoints: [
      [-0.35, -0.15],
      [0.35, -0.1],
      [0.25, 0.2],
      [-0.3, 0.15],
    ],
    speed: 0.18,
    size: 0.05,
    color: C.indigo,
    level: LEVELS.bottom,
  },
];

const AGENT_COUNT = AGENTS.length;
const SCREEN_AGENTS = [3, 4, 5, 10];
const SCREEN_COUNT = SCREEN_AGENTS.length;
const CHATTER_GROUPS = [0, 1, 2, 8, 9];

type Role = "walk" | "talk" | "work" | "idle";
const ROLES: Role[] = AGENTS.map((a, i) => {
  if (a.type === "drifter") return "walk";
  if (SCREEN_AGENTS.includes(i)) return "work";
  if (CHATTER_GROUPS.includes(i)) return "talk";
  return "idle";
});

/* ------------------------------------------------------------------ */
/*  Network connections                                               */
/* ------------------------------------------------------------------ */

const CONNECTIONS: [number, number][] = [
  [0, 1],
  [1, 2],
  [0, 2],
  [3, 4],
  [4, 5],
  [8, 9],
  [9, 10],
  [8, 10],
  [11, 12],
  [3, 8],
  [5, 11],
  [0, 12],
];

/* ------------------------------------------------------------------ */
/*  Grid platform builder                                             */
/* ------------------------------------------------------------------ */

function createPlatformGrid(
  radius: number,
  ringCount: number,
  radialCount: number,
): Float32Array {
  const pts: number[] = [];
  const segs = 48;
  for (let ri = 1; ri <= ringCount; ri++) {
    const r = (ri / ringCount) * radius;
    for (let s = 0; s < segs; s++) {
      const a1 = (s / segs) * Math.PI * 2;
      const a2 = ((s + 1) / segs) * Math.PI * 2;
      pts.push(
        Math.cos(a1) * r,
        0,
        Math.sin(a1) * r,
        Math.cos(a2) * r,
        0,
        Math.sin(a2) * r,
      );
    }
  }
  for (let ri = 0; ri < radialCount; ri++) {
    const a = (ri / radialCount) * Math.PI * 2;
    pts.push(0, 0, 0, Math.cos(a) * radius, 0, Math.sin(a) * radius);
  }
  return new Float32Array(pts);
}

/* ------------------------------------------------------------------ */
/*  Trade arcs                                                        */
/* ------------------------------------------------------------------ */

const MAX_TRADES = 8;
const TRAIL_LEN = 5;
const TOTAL_TRADE_PTS = MAX_TRADES * TRAIL_LEN;
interface TradeArc {
  active: boolean;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  speed: number;
}

function bezierArc(
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
): THREE.Vector3 {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y += 0.2 + a.distanceTo(b) * 0.12;
  const s = 1 - t;
  return new THREE.Vector3(
    s * s * a.x + 2 * s * t * mid.x + t * t * b.x,
    s * s * a.y + 2 * s * t * mid.y + t * t * b.y,
    s * s * a.z + 2 * s * t * mid.z + t * t * b.z,
  );
}

/* ------------------------------------------------------------------ */
/*  Knowledge pulse system                                            */
/* ------------------------------------------------------------------ */

const MAX_PULSES = 10;
const PULSE_TRAIL = 3;
const TOTAL_PULSE_PTS = MAX_PULSES * PULSE_TRAIL;

interface KnowledgePulse {
  active: boolean;
  sourceIdx: number;
  targetIdx: number;
  t: number;
  speed: number;
}

/* ------------------------------------------------------------------ */
/*  Misc constants                                                    */
/* ------------------------------------------------------------------ */

const MAX_BUBBLES = 8;
interface Bubble {
  active: boolean;
  agentIdx: number;
  life: number;
  maxLife: number;
}

const ENERGY_COUNT = 80;
const HALO_COUNT = 180;

/* ------------------------------------------------------------------ */
/*  Figure rig — volumetric pawn with base, body, neck, head, shell   */
/* ------------------------------------------------------------------ */

const FIG = {
  // Base ring
  baseR: 0.14,
  baseTube: 0.025,
  baseY: 0.025,
  // Body cone
  coneR: 0.13,
  coneH: 0.44,
  coneY: 0.24,
  // Neck connector
  neckR: 0.04,
  neckH: 0.06,
  neckY: 0.49,
  // Head
  headR: 0.08,
  headY: 0.58,
  // Rim-glow shell (slightly larger body outline)
  shellConeR: 0.155,
  shellConeH: 0.48,
  shellConeY: 0.24,
  shellHeadR: 0.105,
  shellHeadY: 0.58,
};

interface FigureRig {
  root: THREE.Group;
  headGroup: THREE.Group; // separate group for head bobbing
}

function buildFigure(
  geos: {
    cone: THREE.ConeGeometry;
    head: THREE.SphereGeometry;
    base: THREE.TorusGeometry;
    neck: THREE.CylinderGeometry;
    shellCone: THREE.ConeGeometry;
    shellHead: THREE.SphereGeometry;
  },
  bodyMat: THREE.Material,
  shellMat: THREE.Material,
): FigureRig {
  const root = new THREE.Group();

  // Base ring — grounds the figure
  const base = new THREE.Mesh(geos.base, bodyMat);
  base.position.y = FIG.baseY;
  base.rotation.x = -Math.PI / 2;
  root.add(base);

  // Body cone
  const cone = new THREE.Mesh(geos.cone, bodyMat);
  cone.position.y = FIG.coneY;
  root.add(cone);

  // Neck
  const neck = new THREE.Mesh(geos.neck, bodyMat);
  neck.position.y = FIG.neckY;
  root.add(neck);

  // Head group (separate for independent bobbing)
  const headGroup = new THREE.Group();
  headGroup.position.y = FIG.headY;
  const head = new THREE.Mesh(geos.head, bodyMat);
  headGroup.add(head);
  root.add(headGroup);

  // Rim-glow shell — body outline
  const shellCone = new THREE.Mesh(geos.shellCone, shellMat);
  shellCone.position.y = FIG.shellConeY;
  root.add(shellCone);

  // Rim-glow shell — head outline
  const shellHead = new THREE.Mesh(geos.shellHead, shellMat);
  shellHead.position.y = FIG.shellHeadY;
  root.add(shellHead);

  return { root, headGroup };
}

/* ------------------------------------------------------------------ */
/*  Agent personas — click speech data                                */
/* ------------------------------------------------------------------ */

const PERSONAS: { name: string; lines: string[] }[] = [
  {
    name: "Ava",
    lines: [
      "Fixed 5 bugs before lunch ☕",
      "Test suite: 847/847 passed ✓",
      "Refactored auth → -40% LOC",
    ],
  },
  {
    name: "Mia",
    lines: [
      "New UI mockup ready for review",
      "Redesigned onboarding flow 🎨",
      "A/B test: +23% conversion",
    ],
  },
  {
    name: "Kai",
    lines: [
      "Sprint velocity: 34 pts (+8)",
      "Roadmap Q3 finalized ✓",
      "Standup in 5 mins, team!",
    ],
  },
  {
    name: "Dev",
    lines: [
      "Optimized query: 2.3s → 0.4s",
      "Cache hit rate: 98.7%",
      "Merged PR #482 — 0 conflicts",
    ],
  },
  {
    name: "Zoe",
    lines: [
      "Dashboard metrics updated 📊",
      "Anomaly detected: CPU spike",
      "Weekly report generated ✓",
    ],
  },
  {
    name: "Rex",
    lines: [
      "Uptime: 99.97% this month",
      "Alert resolved: mem leak fixed",
      "Canary build → stable ✓",
    ],
  },
  {
    name: "Luna",
    lines: [
      "Auditing 3 repos this week",
      "Found perf bottleneck in /api",
      "Consulting on microservices",
    ],
  },
  {
    name: "Neo",
    lines: [
      "Pen test: 0 critical issues",
      "Patched CVE-2024-1234 ✓",
      "Rotating API keys…done",
    ],
  },
  {
    name: "Iris",
    lines: [
      "Paper draft: 12 pages done",
      "Experiment #47: accuracy 94.2%",
      "New dataset preprocessed ✓",
    ],
  },
  {
    name: "Sage",
    lines: [
      "Literature review: 38 papers",
      "Model fine-tuning epoch 5/10",
      "Benchmark looks promising 📈",
    ],
  },
  {
    name: "Atlas",
    lines: [
      "Research sync: all aligned",
      "Grant proposal submitted 📝",
      "Lab meeting notes published",
    ],
  },
  {
    name: "Finn",
    lines: [
      "Listed 3 new skills today 💰",
      "Earned $12.40 passive income",
      "Rating: ★★★★☆ (4.3)",
    ],
  },
  {
    name: "Ruby",
    lines: [
      "Completed 28 tasks this week",
      "New client: SaaS startup",
      "Invoice #892 paid ✓",
    ],
  },
  {
    name: "Bolt",
    lines: [
      "Scouting new opportunities…",
      "Matched 5 agent requests",
      "Network expanded: +3 peers",
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Speech bubble overlay                                             */
/* ------------------------------------------------------------------ */

function SpeechBubbleContent({
  name,
  line,
  dismissing,
}: {
  name: string;
  line: string;
  dismissing: boolean;
}) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 20);
    return () => clearTimeout(t);
  }, []);

  const visible = entered && !dismissing;

  return (
    <>
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
      <div
        style={{
          opacity: visible ? 1 : 0,
          transform: visible
            ? "translateY(0) scale(1)"
            : dismissing
              ? "translateY(-8px) scale(0.92)"
              : "translateY(8px) scale(0.92)",
          transition: "opacity 0.28s ease-out, transform 0.28s ease-out",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            background: "rgba(13,17,23,0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6,
            padding: "6px 10px",
            boxShadow:
              "0 4px 24px rgba(0,0,0,0.6), 0 0 12px rgba(16,185,129,0.1)",
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            fontSize: 11,
            lineHeight: 1.5,
            maxWidth: 230,
            whiteSpace: "nowrap" as const,
            position: "relative" as const,
          }}
        >
          <div>
            <span style={{ color: "#34d399", fontWeight: 600 }}>{name}</span>
            <span style={{ color: "#6b7280" }}>@xyzen $ </span>
          </div>
          <div style={{ color: "#d1d5db", marginTop: 2 }}>
            {line}
            <span
              style={{
                color: "#34d399",
                animation: "blink 1s step-end infinite",
                marginLeft: 2,
              }}
            >
              ▌
            </span>
          </div>
          {/* Arrow pointing down */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: -5,
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "5px solid rgba(13,17,23,0.95)",
            }}
          />
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/*  Component                                                         */
/* ================================================================== */

export function AgentSociety() {
  const groupRef = useRef<THREE.Group>(null);
  const shell1Ref = useRef<THREE.Mesh>(null);
  const shell2Ref = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Points>(null);
  const connRef = useRef<THREE.LineSegments>(null);
  const screensRef = useRef<THREE.InstancedMesh>(null);
  const tradeRef = useRef<THREE.Points>(null);
  const bubbleRef = useRef<THREE.InstancedMesh>(null);
  const energyRef = useRef<THREE.Points>(null);
  const pulseRef = useRef<THREE.Points>(null);
  const glowDiscRefs = useRef<(THREE.Mesh | null)[]>([]);
  const ringPointsRefs = useRef<(THREE.Points | null)[]>([]);
  const hitRefs = useRef<(THREE.Mesh | null)[]>([]);
  const speechGroupRef = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // ── Speech bubble state ──
  const [activeSpeech, setActiveSpeech] = useState<{
    idx: number;
    line: string;
  } | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const hoveredAgent = useRef<number | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dismissAnimRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const dismissSpeech = useCallback(() => {
    setDismissing(true);
    dismissAnimRef.current = setTimeout(() => {
      setActiveSpeech(null);
      setDismissing(false);
    }, 300);
  }, []);

  const handleAgentClick = useCallback((idx: number) => {
    clearTimeout(dismissTimerRef.current);
    clearTimeout(dismissAnimRef.current);
    setDismissing(false);
    const persona = PERSONAS[idx];
    const line =
      persona.lines[Math.floor(Math.random() * persona.lines.length)];
    setActiveSpeech((prev) => {
      if (prev && prev.idx === idx) {
        const others = persona.lines.filter((l) => l !== prev.line);
        return {
          idx,
          line:
            others.length > 0
              ? others[Math.floor(Math.random() * others.length)]
              : line,
        };
      }
      return { idx, line };
    });
  }, []);

  const handleBackgroundClick = useCallback(() => {
    if (activeSpeech && !dismissing) dismissSpeech();
  }, [activeSpeech, dismissing, dismissSpeech]);

  // Auto-dismiss after 4s
  useEffect(() => {
    if (!activeSpeech) return;
    dismissTimerRef.current = setTimeout(dismissSpeech, 4000);
    return () => clearTimeout(dismissTimerRef.current);
  }, [activeSpeech, dismissSpeech]);

  // Reset cursor on unmount
  useEffect(
    () => () => {
      document.body.style.cursor = "auto";
    },
    [],
  );

  // ── Figure geometries & materials ──
  const figGeos = useMemo(
    () => ({
      cone: new THREE.ConeGeometry(FIG.coneR, FIG.coneH, 16),
      head: new THREE.SphereGeometry(FIG.headR, 14, 12),
      base: new THREE.TorusGeometry(FIG.baseR, FIG.baseTube, 8, 24),
      neck: new THREE.CylinderGeometry(FIG.neckR, FIG.neckR, FIG.neckH, 8),
      shellCone: new THREE.ConeGeometry(FIG.shellConeR, FIG.shellConeH, 16),
      shellHead: new THREE.SphereGeometry(FIG.shellHeadR, 10, 8),
    }),
    [],
  );

  const matCache = useMemo(() => {
    const map = new Map<
      string,
      { body: THREE.MeshStandardMaterial; shell: THREE.MeshBasicMaterial }
    >();
    for (const agent of AGENTS) {
      const key = agent.color.getHexString();
      if (!map.has(key)) {
        map.set(key, {
          body: new THREE.MeshStandardMaterial({
            color: agent.color.clone().lerp(new THREE.Color("#ffffff"), 0.12),
            emissive: agent.color,
            emissiveIntensity: 0.6,
            transparent: true,
            opacity: 0.92,
            roughness: 0.2,
            metalness: 0.25,
          }),
          shell: new THREE.MeshBasicMaterial({
            color: agent.color,
            transparent: true,
            opacity: 0.12,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        });
      }
    }
    return map;
  }, []);

  const figures = useMemo(
    () =>
      AGENTS.map((a) => {
        const m = matCache.get(a.color.getHexString())!;
        return buildFigure(figGeos, m.body, m.shell);
      }),
    [figGeos, matCache],
  );

  // ── Per-level data ──
  const levelGrids = useMemo(
    () =>
      LEVEL_CONFIG.map((lv) =>
        createPlatformGrid(lv.gridR, lv.rings, lv.radials),
      ),
    [],
  );

  // Flowing ring particle positions per level
  const ringData = useMemo(
    () =>
      LEVEL_CONFIG.map((lv) => {
        const count = lv.ringParticles;
        const baseAngles = new Float32Array(count);
        const radii = new Float32Array(count);
        const yOffsets = new Float32Array(count);
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          baseAngles[i] =
            (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
          radii[i] = lv.gridR * (0.88 + Math.random() * 0.24);
          yOffsets[i] = (Math.random() - 0.5) * 0.05;
        }
        return { count, baseAngles, radii, yOffsets, positions };
      }),
    [],
  );

  // Connection line vertex colors (gradient between level theme colors)
  const connPositions = useMemo(
    () => new Float32Array(CONNECTIONS.length * 6).fill(-100),
    [],
  );
  const connColors = useMemo(() => {
    const arr = new Float32Array(CONNECTIONS.length * 6);
    CONNECTIONS.forEach(([a, b], ci) => {
      const ca = LEVEL_COLOR_MAP[AGENTS[a].level] ?? new THREE.Color("#8B5CF6");
      const cb = LEVEL_COLOR_MAP[AGENTS[b].level] ?? new THREE.Color("#8B5CF6");
      arr[ci * 6] = ca.r;
      arr[ci * 6 + 1] = ca.g;
      arr[ci * 6 + 2] = ca.b;
      arr[ci * 6 + 3] = cb.r;
      arr[ci * 6 + 4] = cb.g;
      arr[ci * 6 + 5] = cb.b;
    });
    return arr;
  }, []);

  // Halo particles
  const haloData = useMemo(() => {
    const positions = new Float32Array(HALO_COUNT * 3);
    for (let i = 0; i < HALO_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.3 + Math.random() * 0.5;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    return positions;
  }, []);

  // ── Knowledge pulse state ──
  const pulsePts = useMemo(
    () => new Float32Array(TOTAL_PULSE_PTS * 3).fill(-100),
    [],
  );
  const pulses = useRef<KnowledgePulse[]>(
    Array.from({ length: MAX_PULSES }, () => ({
      active: false,
      sourceIdx: 0,
      targetIdx: 0,
      t: 0,
      speed: 0,
    })),
  );
  const pulseTimer = useRef(0);
  // (knowledge pulse glow removed — static shell glow instead)

  const spawnPulse = useCallback((fromIdx?: number) => {
    const slot = pulses.current.find((p) => !p.active);
    if (!slot) return;
    // Pick a random connection (optionally starting from fromIdx)
    const candidates =
      fromIdx !== undefined
        ? CONNECTIONS.filter(([a, b]) => a === fromIdx || b === fromIdx)
        : CONNECTIONS;
    if (candidates.length === 0) return;
    const [a, b] = candidates[Math.floor(Math.random() * candidates.length)];
    const src = fromIdx !== undefined ? fromIdx : Math.random() > 0.5 ? a : b;
    const tgt = src === a ? b : a;
    slot.active = true;
    slot.sourceIdx = src;
    slot.targetIdx = tgt;
    slot.t = 0;
    slot.speed = 0.5 + Math.random() * 0.4;
  }, []);

  // ── Runtime state ──
  const agentPos = useRef<THREE.Vector3[]>(
    AGENTS.map(() => new THREE.Vector3(0, -10, 0)),
  );
  const drifterState = useRef(
    AGENTS.filter((a): a is Drifter => a.type === "drifter").map((d) => ({
      t: Math.random() * d.waypoints.length,
    })),
  );

  const trades = useRef<TradeArc[]>(
    Array.from({ length: MAX_TRADES }, () => ({
      active: false,
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      t: 0,
      speed: 0,
    })),
  );
  const tradePts = useMemo(
    () => new Float32Array(TOTAL_TRADE_PTS * 3).fill(-100),
    [],
  );
  const tradeTimer = useRef(0);
  const spawnTrade = useCallback(() => {
    const slot = trades.current.find((tr) => !tr.active);
    if (!slot) return;
    const a = Math.floor(Math.random() * AGENT_COUNT);
    let b = Math.floor(Math.random() * AGENT_COUNT);
    while (b === a) b = Math.floor(Math.random() * AGENT_COUNT);
    slot.active = true;
    slot.from.copy(agentPos.current[a]);
    slot.to.copy(agentPos.current[b]);
    slot.t = 0;
    slot.speed = 0.4 + Math.random() * 0.3;
  }, []);

  const bubs = useRef<Bubble[]>(
    Array.from({ length: MAX_BUBBLES }, () => ({
      active: false,
      agentIdx: 0,
      life: 0,
      maxLife: 1,
    })),
  );
  const bubTimer = useRef(0);
  const spawnBubble = useCallback(() => {
    const slot = bubs.current.find((b) => !b.active);
    if (!slot) return;
    slot.active = true;
    slot.agentIdx =
      CHATTER_GROUPS[Math.floor(Math.random() * CHATTER_GROUPS.length)];
    slot.life = 0;
    slot.maxLife = 0.8 + Math.random() * 0.6;
  }, []);

  const energyPos = useMemo(() => {
    const arr = new Float32Array(ENERGY_COUNT * 3);
    for (let i = 0; i < ENERGY_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 0.02 + Math.random() * 0.05;
      arr[i * 3] = Math.cos(angle) * r;
      arr[i * 3 + 1] =
        LEVELS.bottom + Math.random() * (LEVELS.top - LEVELS.bottom + 0.3);
      arr[i * 3 + 2] = Math.sin(angle) * r;
    }
    return arr;
  }, []);

  const screenColorsSet = useRef(false);

  /* ================================================================ */
  /*  useFrame                                                        */
  /* ================================================================ */

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();

    // ── Shells + halo ──
    if (shell1Ref.current) {
      shell1Ref.current.rotation.x = t * 0.06;
      shell1Ref.current.rotation.z = t * 0.04;
    }
    if (shell2Ref.current) {
      shell2Ref.current.rotation.y = -t * 0.03;
      shell2Ref.current.rotation.x = t * 0.02;
    }
    if (haloRef.current) haloRef.current.rotation.y = -t * 0.05;

    // ── Glow disc pulse ──
    glowDiscRefs.current.forEach((disc, li) => {
      if (disc) {
        const pulse = 1 + Math.sin(t * 1.2 + li * 2.1) * 0.12;
        disc.scale.set(pulse, 1, pulse);
      }
    });

    // ── Flowing ring particles ──
    ringData.forEach((rd, li) => {
      const lv = LEVEL_CONFIG[li];
      for (let i = 0; i < rd.count; i++) {
        const angle = rd.baseAngles[i] + t * lv.flowSpeed * lv.flowDir;
        const r = rd.radii[i] + Math.sin(angle * 3 + t * 0.5) * 0.015;
        const y = rd.yOffsets[i] + Math.sin(angle * 2 + t * 0.7) * 0.015;
        rd.positions[i * 3] = Math.cos(angle) * r;
        rd.positions[i * 3 + 1] = y;
        rd.positions[i * 3 + 2] = Math.sin(angle) * r;
      }
      const pts = ringPointsRefs.current[li];
      if (pts)
        (
          pts.geometry.getAttribute("position") as THREE.BufferAttribute
        ).needsUpdate = true;
    });

    // Screen colors (once)
    if (!screenColorsSet.current && screensRef.current) {
      for (let i = 0; i < SCREEN_COUNT; i++)
        screensRef.current.setColorAt(i, new THREE.Color("#c4b5fd"));
      if (screensRef.current.instanceColor)
        screensRef.current.instanceColor.needsUpdate = true;
      screenColorsSet.current = true;
    }

    // ── Figures ──
    let driftIdx = 0;
    AGENTS.forEach((agent, i) => {
      const isFrozen =
        i === hoveredAgent.current ||
        (activeSpeech !== null && i === activeSpeech.idx);

      let px: number,
        pz: number,
        facingY = 0;
      if (agent.type === "drifter") {
        const st = drifterState.current[driftIdx++];
        if (!isFrozen) st.t += delta * agent.speed;
        const wps = agent.waypoints;
        const total = wps.length;
        const loop = ((st.t % total) + total) % total;
        const seg = Math.floor(loop);
        const frac = loop - seg;
        const from = wps[seg % total];
        const to = wps[(seg + 1) % total];
        px = from[0] + (to[0] - from[0]) * frac;
        pz = from[1] + (to[1] - from[1]) * frac;
        facingY = Math.atan2(to[0] - from[0], to[1] - from[1]);
      } else {
        px = agent.pos[0];
        pz = agent.pos[1];
        facingY = Math.atan2(-px, -pz);
      }

      const floatY = isFrozen
        ? 0
        : agent.type === "stationed"
          ? Math.sin(t * agent.floatSpeed + agent.floatPhase) * agent.floatAmp
          : Math.sin(t * 1.0 + i) * 0.025;
      const worldY = agent.level + floatY;
      agentPos.current[i].set(px, worldY + agent.size, pz);

      const fig = figures[i];
      fig.root.position.set(px, worldY, pz);

      if (!isFrozen) {
        // Breathing scale — subtle pulse
        const breath = 1 + Math.sin(t * 1.5 + i * 0.9) * 0.02;
        fig.root.scale.setScalar(agent.size * 3.2 * breath);

        const role = ROLES[i];
        const phase = t + i * 1.3;
        let leanX = 0,
          leanZ = 0;
        let headBobX = 0,
          headBobZ = 0;

        if (role === "walk") {
          leanX = 0.08 + Math.sin(phase * 3.5) * 0.06;
          leanZ = Math.sin(phase * 1.8) * 0.04;
          headBobX = Math.sin(phase * 3.5 + 0.5) * 0.12;
        } else if (role === "talk") {
          leanX = Math.sin(phase * 2.2) * 0.06;
          leanZ = Math.sin(phase * 0.9) * 0.05;
          headBobX = Math.sin(phase * 3.0) * 0.15;
          headBobZ = Math.sin(phase * 1.5) * 0.1;
        } else if (role === "work") {
          leanX = -0.1 + Math.sin(phase * 2.5) * 0.03;
          headBobX = -0.12 + Math.sin(phase * 1.8) * 0.18;
        } else {
          leanZ = Math.sin(phase * 0.7) * 0.04;
          headBobX = Math.sin(phase * 0.5) * 0.08;
          headBobZ = Math.sin(phase * 0.35) * 0.06;
        }

        fig.root.rotation.set(leanX, facingY, leanZ);
        fig.headGroup.rotation.set(headBobX, 0, headBobZ);
      }
    });

    // ── Connection lines ──
    if (connRef.current) {
      CONNECTIONS.forEach(([a, b], ci) => {
        const pa = agentPos.current[a];
        const pb = agentPos.current[b];
        const o = ci * 6;
        connPositions[o] = pa.x;
        connPositions[o + 1] = pa.y;
        connPositions[o + 2] = pa.z;
        connPositions[o + 3] = pb.x;
        connPositions[o + 4] = pb.y;
        connPositions[o + 5] = pb.z;
      });
      (
        connRef.current.geometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute
      ).needsUpdate = true;
    }

    // ── Knowledge pulses ──
    pulseTimer.current += delta;
    if (pulseTimer.current > 1.2) {
      pulseTimer.current = 0;
      spawnPulse();
    }

    pulses.current.forEach((p, pi) => {
      const base = pi * PULSE_TRAIL;
      if (!p.active) {
        for (let k = 0; k < PULSE_TRAIL; k++)
          pulsePts[(base + k) * 3 + 1] = -100;
        return;
      }
      p.t += delta * p.speed;
      if (p.t >= 1) {
        p.active = false;
        // Cascade: 50% chance to propagate
        if (Math.random() < 0.5) spawnPulse(p.targetIdx);
        for (let k = 0; k < PULSE_TRAIL; k++)
          pulsePts[(base + k) * 3 + 1] = -100;
        return;
      }
      const from = agentPos.current[p.sourceIdx];
      const to = agentPos.current[p.targetIdx];
      for (let k = 0; k < PULSE_TRAIL; k++) {
        const pt = Math.max(0, p.t - k * 0.06);
        if (pt <= 0) {
          pulsePts[(base + k) * 3 + 1] = -100;
          continue;
        }
        pulsePts[(base + k) * 3] = from.x + (to.x - from.x) * pt;
        pulsePts[(base + k) * 3 + 1] = from.y + (to.y - from.y) * pt;
        pulsePts[(base + k) * 3 + 2] = from.z + (to.z - from.z) * pt;
      }
    });
    if (pulseRef.current)
      (
        pulseRef.current.geometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute
      ).needsUpdate = true;

    // ── Screens ──
    if (screensRef.current) {
      SCREEN_AGENTS.forEach((agentIdx, si) => {
        const pos = agentPos.current[agentIdx];
        const flicker = 0.7 + Math.sin(t * 3.5 + si * 2.5) * 0.2;
        const hoverAngle = t * 0.4 + si * 1.5;
        const dist = AGENTS[agentIdx].size + 0.06;
        dummy.position.set(
          pos.x + Math.sin(hoverAngle) * dist,
          pos.y + 0.01,
          pos.z + Math.cos(hoverAngle) * dist,
        );
        dummy.rotation.set(0, -hoverAngle + Math.PI, 0.15);
        dummy.scale.set(flicker * 0.8, flicker * 0.6, 1);
        dummy.updateMatrix();
        screensRef.current!.setMatrixAt(si, dummy.matrix);
      });
      screensRef.current.instanceMatrix.needsUpdate = true;
    }

    // ── Trade arcs ──
    tradeTimer.current += delta;
    if (tradeTimer.current > 0.5) {
      tradeTimer.current = 0;
      if (trades.current.filter((tr) => tr.active).length < 4) spawnTrade();
    }
    trades.current.forEach((arc, ai) => {
      const base = ai * TRAIL_LEN;
      if (!arc.active) {
        for (let p = 0; p < TRAIL_LEN; p++) tradePts[(base + p) * 3 + 1] = -100;
        return;
      }
      arc.t += delta * arc.speed;
      if (arc.t >= 1) {
        arc.active = false;
        for (let p = 0; p < TRAIL_LEN; p++) tradePts[(base + p) * 3 + 1] = -100;
        return;
      }
      for (let p = 0; p < TRAIL_LEN; p++) {
        const pt = Math.max(0, arc.t - p * 0.045);
        if (pt <= 0) {
          tradePts[(base + p) * 3 + 1] = -100;
          continue;
        }
        const pos = bezierArc(arc.from, arc.to, Math.min(pt, 1));
        tradePts[(base + p) * 3] = pos.x;
        tradePts[(base + p) * 3 + 1] = pos.y;
        tradePts[(base + p) * 3 + 2] = pos.z;
      }
    });
    if (tradeRef.current)
      (
        tradeRef.current.geometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute
      ).needsUpdate = true;

    // ── Bubbles ──
    bubTimer.current += delta;
    if (bubTimer.current > 0.35) {
      bubTimer.current = 0;
      if (bubs.current.filter((b) => b.active).length < 4) spawnBubble();
    }
    if (bubbleRef.current) {
      bubs.current.forEach((b, bi) => {
        if (!b.active) {
          dummy.position.set(0, -100, 0);
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          bubbleRef.current!.setMatrixAt(bi, dummy.matrix);
          return;
        }
        b.life += delta;
        if (b.life >= b.maxLife) {
          b.active = false;
          dummy.position.set(0, -100, 0);
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          bubbleRef.current!.setMatrixAt(bi, dummy.matrix);
          return;
        }
        const ratio = b.life / b.maxLife;
        const fade =
          ratio < 0.15 ? ratio / 0.15 : Math.max(0, 1 - (ratio - 0.4) / 0.6);
        const s = 0.012 * fade;
        const pos = agentPos.current[b.agentIdx];
        dummy.position.set(
          pos.x + Math.sin(t * 2.5 + bi) * 0.015,
          pos.y + AGENTS[b.agentIdx].size + 0.04 + ratio * 0.1,
          pos.z + Math.cos(t * 2.5 + bi) * 0.015,
        );
        dummy.rotation.set(0, t * 2, Math.PI / 4);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        bubbleRef.current!.setMatrixAt(bi, dummy.matrix);
      });
      bubbleRef.current.instanceMatrix.needsUpdate = true;
    }

    // ── Energy column ──
    if (energyRef.current) {
      const attr = energyRef.current.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute;
      for (let i = 0; i < ENERGY_COUNT; i++) {
        let y = energyPos[i * 3 + 1];
        y += delta * (0.06 + Math.sin(t + i * 0.3) * 0.02);
        if (y > LEVELS.top + 0.35) {
          y = LEVELS.bottom - 0.1;
          const angle = Math.random() * Math.PI * 2;
          const r = 0.02 + Math.random() * 0.04;
          energyPos[i * 3] = Math.cos(angle) * r;
          energyPos[i * 3 + 2] = Math.sin(angle) * r;
        }
        energyPos[i * 3 + 1] = y;
      }
      attr.needsUpdate = true;
    }

    // ── Position hit-test meshes ──
    AGENTS.forEach((_, i) => {
      const hit = hitRefs.current[i];
      if (hit) hit.position.copy(agentPos.current[i]);
    });

    // ── Position speech bubble ──
    if (speechGroupRef.current && activeSpeech) {
      const pos = agentPos.current[activeSpeech.idx];
      const agentScale = AGENTS[activeSpeech.idx].size * 3.2;
      speechGroupRef.current.position.set(
        pos.x,
        pos.y + agentScale * 0.45 + 0.05,
        pos.z,
      );
    }

    if (groupRef.current) groupRef.current.rotation.y = t * 0.04;
  });

  /* ================================================================ */
  /*  JSX                                                             */
  /* ================================================================ */

  return (
    <group ref={groupRef}>
      {/* ── Wireframe containment shells ── */}
      <mesh ref={shell1Ref}>
        <icosahedronGeometry args={[1.3, 1]} />
        <meshBasicMaterial
          color="#a78bfa"
          wireframe
          transparent
          opacity={0.1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={shell2Ref} rotation={[0.3, 0.5, 0]}>
        <icosahedronGeometry args={[1.6, 0]} />
        <meshBasicMaterial
          color="#c4b5fd"
          wireframe
          transparent
          opacity={0.05}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* ── Particle halo ── */}
      <points ref={haloRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[haloData, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.02}
          color="#c4b5fd"
          transparent
          opacity={0.25}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* ── Per-level: grid + glow disc + flowing ring ── */}
      {LEVEL_CONFIG.map((lv, li) => (
        <group key={li}>
          {/* Grid platform */}
          <lineSegments position={[0, lv.y, 0]}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[levelGrids[li], 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial
              color={lv.gridColor}
              transparent
              opacity={0.18}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </lineSegments>

          {/* Glow disc (pulsing) */}
          <mesh
            ref={(el) => {
              glowDiscRefs.current[li] = el;
            }}
            position={[0, lv.y - 0.002, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[lv.gridR * 1.05, 48]} />
            <meshBasicMaterial
              color={lv.glowColor}
              transparent
              opacity={0.035}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          {/* Flowing particle ring */}
          <points
            ref={(el: THREE.Points | null) => {
              ringPointsRefs.current[li] = el;
            }}
            position={[0, lv.y, 0]}
          >
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[ringData[li].positions, 3]}
              />
            </bufferGeometry>
            <pointsMaterial
              size={0.015}
              color={lv.particleColor}
              transparent
              opacity={0.6}
              sizeAttenuation
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </points>
        </group>
      ))}

      {/* ── Energy column ── */}
      <points ref={energyRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[energyPos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.012}
          color="#c4b5fd"
          transparent
          opacity={0.5}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* ── Figures ── */}
      {figures.map((fig, i) => (
        <primitive key={i} object={fig.root} />
      ))}

      {/* ── Connection lines (vertex-colored per level) ── */}
      <lineSegments ref={connRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[connPositions, 3]}
          />
          <bufferAttribute attach="attributes-color" args={[connColors, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.25}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      {/* ── Knowledge pulses ── */}
      <points ref={pulseRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[pulsePts, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.035}
          color="#ffffff"
          transparent
          opacity={0.9}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* ── Holographic screens ── */}
      <instancedMesh
        ref={screensRef}
        args={[undefined, undefined, SCREEN_COUNT]}
        frustumCulled={false}
      >
        <planeGeometry args={[0.06, 0.04]} />
        <meshBasicMaterial
          color="#c4b5fd"
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>

      {/* ── Trade arcs ── */}
      <points ref={tradeRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[tradePts, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.02}
          color="#FCD34D"
          transparent
          opacity={0.85}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* ── Speech bubbles ── */}
      <instancedMesh
        ref={bubbleRef}
        args={[undefined, undefined, MAX_BUBBLES]}
        frustumCulled={false}
      >
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial
          color="#E0D4FF"
          transparent
          opacity={0.6}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>

      {/* ── Background click catcher (dismiss bubble) ── */}
      <mesh onClick={handleBackgroundClick}>
        <sphereGeometry args={[20]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>

      {/* ── Clickable hit-test spheres (invisible) ── */}
      {AGENTS.map((agent, i) => (
        <mesh
          key={`hit-${i}`}
          ref={(el) => {
            hitRefs.current[i] = el;
          }}
          onClick={(e) => {
            e.stopPropagation();
            handleAgentClick(i);
          }}
          onPointerOver={() => {
            document.body.style.cursor = "pointer";
            hoveredAgent.current = i;
          }}
          onPointerOut={() => {
            document.body.style.cursor = "auto";
            hoveredAgent.current = null;
          }}
        >
          <sphereGeometry args={[agent.size * 3.2 * 0.5]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}

      {/* ── Click speech bubble (HTML overlay) ── */}
      <group ref={speechGroupRef}>
        <Html
          center
          sprite
          distanceFactor={7}
          style={{ pointerEvents: "none" }}
        >
          {activeSpeech && (
            <SpeechBubbleContent
              key={`${activeSpeech.idx}-${activeSpeech.line}`}
              name={PERSONAS[activeSpeech.idx].name}
              line={activeSpeech.line}
              dismissing={dismissing}
            />
          )}
        </Html>
      </group>
    </group>
  );
}
