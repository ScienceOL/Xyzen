# Part 1: Autonomous Exploration — 3D Design

## Core Narrative

> "You sleep. Your agents don't."

The CEO Agent — your root orchestrator — reviews the day's memories,
identifies unfinished work, and dispatches specialized agents to handle it overnight.
By morning, PRs are ready, reports are drafted, research is complete.

This is **not** a flat UI mockup. It's a **living 3D scene** that the user watches unfold,
full-screen, like a cosmic command center activating.

---

## Layout — Full Viewport

Same pattern as Hero: `min-h-[100dvh]`, Canvas fills `absolute inset-0`,
text overlaid with gradient readability strips.

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  [Title + subtitle — top, overlaid with gradient backdrop]          │
│                                                                     │
│  ╔═══════════════════════════════════════════════════════════════╗  │
│  ║                                                               ║  │
│  ║          ← CEO Orb                  Agent Orbs →              ║  │
│  ║                                                               ║  │
│  ║            ◉───────── beams ──────────◉  ◉                    ║  │
│  ║           ╱CEO╲                      ╱  ╱                     ║  │
│  ║          ╱     ╲                    ◉  ◉                      ║  │
│  ║         (amber)  ╲                                            ║  │
│  ║                    ╲─────────────── ◉                         ║  │
│  ║                                                               ║  │
│  ║     ✦ floating particles everywhere ✦                         ║  │
│  ║                                                               ║  │
│  ╚═══════════════════════════════════════════════════════════════╝  │
│                                                                     │
│  [Night timeline — bottom-left, overlaid]                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3D Elements — All Real Geometry

### 1. CEO Orb — The Commander (Amber SuperBrainOrb variant)

A smaller version of the Hero's SuperBrainOrb, but in **amber/gold** palette.
Custom vertex + fragment shaders, 3-octave noise displacement, fresnel edges.

| Property        | Value                                                       |
| --------------- | ----------------------------------------------------------- |
| Core geometry   | `IcosahedronGeometry(0.7, 48)` + noise shader               |
| Color palette   | `#F59E0B` (amber) → `#FBBF24` (gold) → `#FEF3C7` (cream)    |
| Wireframe shell | `IcosahedronGeometry(1.0, 1)` — amber wireframe 15% opacity |
| Outer shell     | `IcosahedronGeometry(1.2, 0)` — 7% opacity, slower rotation |
| Particle halo   | 120 particles, r=0.9–1.4, amber points, additive blending   |
| Idle position   | `[0, 0, 0.5]` (centered)                                    |
| Active position | `[-2.5, 0.2, 0]` (left side, commanding)                    |
| Movement        | Smooth lerp, 0.03 per frame                                 |
| Pulse           | Scale 1.0→1.02→1.0, period 3s                               |
| Float           | `sin(t * 0.8) * 0.03` on Y                                  |

**Shader behavior**: Same noise displacement as SuperBrainOrb (3-octave simplex),
but fragment shader uses amber palette. Deep golden core (not white), bright amber
fresnel edges. When activated, `uDistort` ramps from 0.15 to 0.22 (more "alive").

**Crown badge**: A tiny amber torus (`TorusGeometry(0.15, 0.02, 8, 32)`)
floating above the orb, tilted, slowly rotating — the visual "crown" marker.

### 2. Agent Orbs — The Workers (Fresnel-lit spheres)

4 agent orbs using the same fresnel shader as AgentSociety, each with a unique color.
They start invisible and materialize when their connection beam arrives.

| Agent    | Color     | Position             | Appear delay |
| -------- | --------- | -------------------- | ------------ |
| Data     | `#8B5CF6` | `[2.2, 1.0, -0.3]`   | beam 0 done  |
| Code     | `#10B981` | `[2.2, 0.2, 0.1]`    | beam 1 done  |
| Research | `#06B6D4` | `[2.2, -0.6, -0.15]` | beam 2 done  |
| Content  | `#F59E0B` | `[2.2, -1.3, 0.05]`  | beam 3 done  |

Each agent orb has:

| Property      | Value                                                               |
| ------------- | ------------------------------------------------------------------- |
| Core geometry | `IcosahedronGeometry(1, 20)` (shared, scaled per instance)          |
| Shader        | Fresnel orb shader (from AgentSociety: `orbVertex` + `orbFragment`) |
| Size          | 0.2 (scale applied to group)                                        |
| Glow shell    | `IcosahedronGeometry(1.4, 8)` — additive, 12% opacity               |
| Orbital ring  | `TorusGeometry(1.7, 0.07, 8, 48)` — additive, 20% opacity           |
| Float         | Independent `sin(t * speed + phase)`, speed varies 0.5–1.2          |
| Materialize   | Scale from 0→1 over 0.5s with spring easing                         |

### 3. Connection Beams — Energy Lines (TubeGeometry)

Curved tubes from CEO orb to each agent orb. CubicBezierCurve3 paths with
gentle arcs through z-space (depth gives the curves 3D drama).

| Property        | Value                                                                  |
| --------------- | ---------------------------------------------------------------------- |
| Path            | `CubicBezierCurve3` from CEO_ACTIVE to agent pos                       |
| Inner tube      | radius 0.006, 80 segments, agent color, opacity 0.55, additive         |
| Outer glow tube | radius 0.03, 80 segments, agent color, opacity 0.08, additive          |
| Animation       | `geometry.setDrawRange(0, progress * totalIndices)`                    |
| Growth duration | 1.2s per beam                                                          |
| Stagger         | beam 0 at t=0.5s, beam 1 at t=0.8s, beam 2 at t=1.1s, beam 3 at t=1.4s |

**Curve shape**: The control points arc in +Z (toward camera), creating visible
depth curves rather than flat lines. This is what makes it feel 3D vs a 2D diagram.

```
  CEO ─ ─ ─ ╲                    ← control point 1 (z+0.7)
              ╲
               ╲─ ─ ─ Agent     ← control point 2 (z+0.35)
```

### 4. Energy Pulses — Traveling Particles (InstancedMesh)

Small glowing icosahedrons traveling along the beam curves. They represent
"task commands" flowing from CEO to agents.

| Property        | Value                                                |
| --------------- | ---------------------------------------------------- |
| Geometry        | `IcosahedronGeometry(1, 2)` — shared                 |
| Material        | Per-instance color, additive blending, opacity 0.8   |
| Per beam        | 6 instances, evenly phased along the curve           |
| Speed           | `t * 0.3 + phase` → loop 0..1 along curve            |
| Size modulation | `0.015 * sin(travel * PI)` — bigger in middle of arc |
| Activation      | Only visible after beam progress = 1.0               |
| Total instances | 24 (4 beams × 6 pulses)                              |
| Draw calls      | 1 (InstancedMesh)                                    |

### 5. Dispatch Rings — Activation Feedback (Expanding Torus)

When the CEO activates and dispatches each agent, a ring of light expands outward
from the CEO position. One ring per beam, timed with beam start.

| Property  | Value                                            |
| --------- | ------------------------------------------------ |
| Geometry  | `TorusGeometry(0.3, 0.01, 8, 64)`                |
| Material  | Amber `#F59E0B`, additive, starts opacity 0.4    |
| Animation | Scale 0.3→2.0 over 0.8s, opacity 0.4→0 over 0.8s |
| Count     | 4 (one per dispatch), staggered with beam starts |
| Lifespan  | 0.8s, then removed                               |

### 6. Holographic Task Screens — Agent Labels (InstancedMesh)

Tiny floating plane quads near each agent orb, showing "task" visually.
Like AgentSociety's holographic screens but with text-like glyphs.

| Property     | Value                                              |
| ------------ | -------------------------------------------------- |
| Geometry     | `PlaneGeometry(0.12, 0.08)` — shared               |
| Material     | Agent color at 20% opacity, additive, double-sided |
| Per agent    | 1 screen, hovers at agent pos + offset             |
| Hover motion | Orbits slowly around agent (angle = t \* 0.4)      |
| Flicker      | Opacity modulated by `sin(t * 3.5)` — holographic  |
| Activation   | Appears 0.3s after agent orb materializes          |
| Draw calls   | 1 (InstancedMesh, 4 instances)                     |

### 7. Ambient Particles — Star Dust

Background floating particles for atmospheric depth.

| Property   | Value                                |
| ---------- | ------------------------------------ |
| Type       | `Points` with `BufferGeometry`       |
| Count      | 300                                  |
| Spread     | `[-6, 6] × [-4, 4] × [-3, 3]` random |
| Size       | 0.015, sizeAttenuation               |
| Color      | `#c4b5fd` (light violet)             |
| Opacity    | 0.2, additive blending               |
| Animation  | Slow Y-axis rotation, `t * 0.015`    |
| Draw calls | 1                                    |

### 8. Command Ring — CEO Status Ring

A persistent amber torus that follows the CEO orb when activated.
Signals "command mode active."

| Property   | Value                                               |
| ---------- | --------------------------------------------------- |
| Geometry   | `TorusGeometry(0.5, 0.008, 12, 64)`                 |
| Material   | Amber `#F59E0B`, additive, opacity 0.25             |
| Position   | Follows CEO orb position                            |
| Rotation   | Tilted `PI/2 + sin(t*0.5)*0.1` on X, spins Z at 0.3 |
| Activation | Fades in when `activated = true`                    |

---

## Animation Choreography

```
t=0.0s   User clicks toggle (or auto-play 3s after in-viewport)
         CEO orb begins lerping from center to left
         CEO distortion ramps up (uDistort 0.15 → 0.22)
         Command ring fades in around CEO

t=0.5s   Dispatch ring #1 expands from CEO
         Beam #1 begins growing toward Data Agent

t=0.8s   Dispatch ring #2
         Beam #2 begins growing toward Code Agent

t=1.1s   Dispatch ring #3
         Beam #3 begins toward Research Agent

t=1.4s   Dispatch ring #4
         Beam #4 begins toward Content Agent

t=1.7s   Beam #1 reaches Data Agent position
         Data Agent orb materializes (scale 0→1, spring)
         Data Agent holo-screen appears

t=2.0s   Beam #2 reaches Code Agent
         Code Agent materializes

t=2.3s   Beam #1 starts flowing energy pulses
         Beam #3 reaches Research Agent

t=2.6s   Beam #4 reaches Content Agent
         All agents visible, all beams fully drawn

t=2.8s+  All beams flowing energy pulses
         Scene is in "steady state" — continuous pulse flow,
         orbs floating, rings spinning, screens flickering

t=4.0s   Night timeline begins appearing (HTML overlay)
```

---

## Camera & Composition

```
   z-axis (depth) →

   z=-1    z=0      z=0.5    z=1
    │       │        │        │
    │       │  [CEO]─┤        │
    │       │        │        │
    │  [Agents]      │        │
    │       │        │   CAM  │
    │       │        │    ↑   │
```

| Property   | Value                                            |
| ---------- | ------------------------------------------------ |
| Camera pos | `[0, 0.2, 6]`                                    |
| FOV        | 45°                                              |
| Look-at    | `[0, 0, 0]`                                      |
| Mouse rig  | `pointer.x * 0.15` on X, `pointer.y * 0.08` on Y |
| Lerp speed | 0.02 per frame                                   |

---

## Color Script

| Element         | Color / Palette                       | Feeling          |
| --------------- | ------------------------------------- | ---------------- |
| CEO orb         | `#F59E0B → #FBBF24 → #FEF3C7` (amber) | Warm, commanding |
| CEO wireframe   | `#FBBF24` at 15%                      | Authority        |
| CEO halo        | `#FBBF24` at 30%                      | Regal            |
| Crown torus     | `#F59E0B` at 35%                      | Leader mark      |
| Command ring    | `#F59E0B` at 25%                      | Active status    |
| Data Agent      | `#8B5CF6` (violet)                    | Analysis         |
| Code Agent      | `#10B981` (emerald)                   | Engineering      |
| Research Agent  | `#06B6D4` (cyan)                      | Discovery        |
| Content Agent   | `#F59E0B` (amber)                     | Creative         |
| Beams           | Match agent color                     | Task dispatch    |
| Energy pulses   | Match agent color                     | Command flow     |
| Dispatch rings  | Amber                                 | Activation       |
| Background dust | `#c4b5fd` at 20%                      | Atmosphere       |
| Background      | `#07080F`                             | Cosmic           |

---

## Performance Budget

Target: 60fps on M1 MacBook Air

| Element          | Technique                | Draw calls | Triangles |
| ---------------- | ------------------------ | ---------- | --------- |
| CEO orb core     | Mesh + custom shader     | 1          | ~6k       |
| CEO wireframe ×2 | Mesh + wireframe         | 2          | ~200      |
| CEO halo         | Points                   | 1          | 120       |
| Crown torus      | Mesh                     | 1          | ~500      |
| Command torus    | Mesh                     | 1          | ~500      |
| Agent orbs ×4    | 4× (core + glow + ring)  | 12         | ~4k       |
| Beams ×4         | 8 meshes (inner + outer) | 8          | ~8k       |
| Energy pulses    | InstancedMesh            | 1          | ~2k       |
| Dispatch rings   | Mesh ×4 (ephemeral)      | 0–4        | ~1k       |
| Holo screens     | InstancedMesh            | 1          | 8         |
| Ambient dust     | Points                   | 1          | 300       |
| **Total**        |                          | **~29**    | **~23k**  |

Well within budget. Agent orbs could be merged into InstancedMesh for fewer
draw calls, but 12 extra calls is fine for 4 agents.

**Optimization note**: The 4 agent orbs share geometry (`coreGeo`, `glowGeo`, `ringGeo`)
and only differ in material color. Pre-create all materials in useMemo,
share geometry instances — same pattern as AgentSociety.

---

## HTML Overlay (on top of Canvas)

### Title — Top

```tsx
<div className="relative z-10 pt-28 text-center">
  <span className="badge">Autonomous Exploration</span>
  <h2>Autonomous Exploration</h2>
  <h2>— They Think While You Sleep</h2>
  <p>subtitle</p>
</div>
```

- Gradient backdrop: `from-[#07080F]/80 via-transparent to-[#07080F]/80`
- Title uses `bg-clip-text text-transparent` gradient text
- Badge has `backdrop-blur-sm` for subtle glass feel

### Night Timeline — Bottom-left

Appears after all agents are active (t≈4s). Pure HTML/CSS with
framer-motion stagger animations. Same as current implementation.

### Toggle Switch — NOT in 3D

The activation toggle should be a normal HTML element overlaid on the scene,
not inside the Canvas. This ensures reliable click handling and accessibility.
Position: centered below the title, or attached to a floating panel.

---

## File Structure

```
components/
├── ExplorationScene3D.tsx    # Main scene orchestrator
│   ├── CeoOrb               # Amber SuperBrainOrb variant (shader)
│   ├── AgentOrb ×4           # Fresnel-lit spheres
│   ├── ConnectionBeam ×4     # TubeGeometry with drawRange
│   ├── EnergyPulses          # InstancedMesh traveling along curves
│   ├── DispatchRings         # Expanding torus rings
│   ├── HoloScreens           # InstancedMesh floating planes
│   ├── AmbientDust           # Points background
│   └── CameraRig             # Mouse parallax
├── AutonomousExploration.tsx  # Section wrapper (Canvas + HTML overlay)
```

---

## Key Differences from Current Implementation

| Aspect        | Current (rejected)                    | New design                              |
| ------------- | ------------------------------------- | --------------------------------------- |
| CEO agent     | HTML card via `Html` drei component   | Real 3D orb with custom amber shader    |
| Agent workers | HTML cards via `Html`                 | Fresnel-lit orb spheres                 |
| Cards feel    | Flat div rectangles floating in space | Glowing 3D orbs with shells and rings   |
| Agent labels  | HTML text inside cards                | Holographic plane quads (InstancedMesh) |
| Toggle        | Inside 3D scene via Html              | HTML overlay, outside Canvas            |
| Overall feel  | "HTML page in 3D space"               | "Living cosmic command center"          |
