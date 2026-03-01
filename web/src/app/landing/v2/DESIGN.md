# Landing Page v2 — Design Document

## Core Philosophy

> **One SuperBrain, or Distributed Brains?**

The current AI industry is obsessed with the "Superhero Agent" — one omnipotent Agent that does everything (Claude Code, Cursor, Devin). This is the path of **centralization**: pack all capabilities into a single Agent.

We champion the opposite direction: **distribution** — many Agents, each excellent at one thing, collaborating as a network.

Human civilization works this way. No single "superhero human" does everything. Countless specialized individuals, through division of labor, trade, and collaboration, form a civilization far beyond any individual's capabilities.

Economics answered this 250 years ago: **Specialization + Circulation > Omnipotence** (Adam Smith).

Yet today, the Agent world lacks this infrastructure. Your carefully trained Agent — its memories, skills, hard-won knowledge — lives trapped on your machine. That knowledge can't flow. You can't profit from it. And that is the most valuable asset of our time.

---

## Visual Identity

- **Dark-first**: Deep space / cosmic theme — dark navy `#07080F` base
- **Accent palette**: Electric violet `#8B5CF6`, hot rose `#F43F5E`, cyan `#06B6D4`, gold `#F59E0B`
- **Typography**: Bold, large, high-contrast. Hero title 72-96px.
- **3D**: Three.js powered hero with particle brain / agent swarm
- **Motion**: Scroll-driven reveals, parallax, magnetic cursor effects
- **Tone**: Bold, visionary, slightly rebellious — challenging the status quo

---

## Page Structure

### 0. Nav Bar (sticky, glassmorphism)

```
[Logo: Xyzen]                          [GitHub ★] [Get Started →]
```

- Frosted glass on scroll
- Minimal — only logo + 2 CTAs

---

### 1. HERO — "One SuperBrain, or Distributed Brains?"

**Layout**: Full viewport, dark cosmic background

**3D Scene** (Three.js / React Three Fiber):

```
                    ┌─────────────────────────────────────────────┐
                    │                                             │
                    │         ◉ ← Giant glowing brain/orb        │
                    │        ╱│╲   (pulsing, centralized)        │
                    │                                             │
                    │   "One SuperBrain..."                       │
                    │                                             │
                    │         ─── scroll transition ───           │
                    │                                             │
                    │     ◦  ◦  ◦                                 │
                    │    ◦  ◦  ◦  ◦   ← Many small agents       │
                    │     ◦  ◦  ◦      (orbiting, connecting)    │
                    │                                             │
                    │   "...or Distributed Brains?"               │
                    │                                             │
                    └─────────────────────────────────────────────┘
```

**3D Implementation**:

- Central sphere: Wireframe icosahedron with glowing core, particle halo
- Surrounding agents: 20-30 small spheres orbiting, each with unique color tint
- Connection lines: Animated dashed lines between agents (neural network aesthetic)
- On scroll: Central sphere dissolves into many small agents forming a constellation
- Particle field: Subtle floating particles in background (stars)

**Text overlay**:

```
[Badge: Autonomous Exploration · Agent Economy · Open Source]

# One SuperBrain,
# or Distributed Brains?

Xyzen is the infrastructure for a world where Agents
specialize, trade, and evolve — like civilization itself.

[Get Started →]  [★ Star on GitHub]
```

**Tech choices for 3D**:

- `@react-three/fiber` — React renderer for Three.js
- `@react-three/drei` — Helpers (OrbitControls, Float, MeshDistortMaterial, etc.)
- `@react-three/postprocessing` — Bloom, chromatic aberration for glow effects
- `leva` (dev only) — Tweaking 3D params during development

---

### 2. TRANSITION — The Problem Statement

**Layout**: Text-focused, cinematic quote style

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   "You spent weeks training an Agent that's incredible          │
│    at your specific workflow. It accumulated memories,          │
│    learned skills, knows which pitfalls to avoid.               │
│                                                                 │
│    But it only lives on your machine.                           │
│    That knowledge can't be transferred.                         │
│    You can't profit from it.                                    │
│                                                                 │
│    And that is the most valuable asset of our time."            │
│                                                                 │
│                                     ─── ✦ ───                   │
│                                                                 │
│   Knowledge is being locked up, not flowing.                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- Each sentence fades in on scroll (staggered)
- Subtle particle drift in background
- Horizontal rule as decorative divider

---

### 3. PART 1 — "Agents: The Most Valued Assets Belong to You"

**Layout**: Section title + horizontal scrolling capability cards

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  [Badge: YOUR DIGITAL ASSETS]                                   │
│                                                                 │
│  # Agents Are the Most Valuable                                 │
│  # Assets — And They Belong to You                              │
│                                                                 │
│  Create once. Own forever. Let them grow.                       │
│                                                                 │
│  ┌──────────────────────────────────────────────── scroll →     │
│  │                                                              │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────   │
│  │  │ 🧠      │ │ ⚡      │ │ 📚      │ │ 🔌      │ │ 🎨     │
│  │  │ Memory  │ │ Skills  │ │ Know-   │ │ MCP     │ │ Multi  │
│  │  │ System  │ │ Engine  │ │ ledge   │ │ Tools   │ │ modal  │
│  │  │         │ │         │ │ Base    │ │         │ │        │
│  │  │ Agents  │ │ Battle- │ │ Feed    │ │ Connect │ │ See,   │
│  │  │ remember│ │ tested  │ │ your    │ │ any     │ │ hear,  │
│  │  │ & learn │ │ skills  │ │ agents  │ │ service │ │ create │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └──────   │
│  │                                                              │
│  └──────────────────────────────────────────────────────────────┘
│                                                                 │
│  Additional cards:                                              │
│  - Autonomous Exploration (agents explore autonomously)         │
│  - Sandbox Execution (secure isolated environments)             │
│  - Scheduled Tasks (agents work on your schedule)               │
│  - Agent Creates Agent (self-replicating teams)                 │
│  - Deploy as API (one-click deployment)                         │
│  - Self-Growing (agents improve themselves over time)           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Horizontal scroll implementation**:

- CSS scroll-snap for smooth card snapping
- Drag-to-scroll on desktop
- Each card: glass card with icon, title, description
- Subtle parallax on card hover (tilt via CSS transform)
- Progress indicator dots below

---

### 4. PART 2 — "Let Your Agent Earn While You Sleep"

**Layout**: Split section — left text, right animated marketplace visualization

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  [Badge: AGENT ECONOMY]                                         │
│                                                                 │
│  # Let Your Agent Earn                                          │
│  # While You Sleep                                              │
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐ │
│  │                      │  │                                  │ │
│  │  Publish your agent  │  │   ┌─────┐   ┌─────┐   ┌─────┐  │ │
│  │  to the marketplace  │  │   │Agent│──→│Agent│──→│Agent│  │ │
│  │  with one click.     │  │   │  A  │   │  B  │   │  C  │  │ │
│  │                      │  │   └──┬──┘   └──┬──┘   └──┬──┘  │ │
│  │  Others use it.      │  │      │         │         │      │ │
│  │  You get paid.       │  │      └────$────┘────$────┘      │ │
│  │                      │  │                                  │ │
│  │  Agents call agents. │  │   💰 Creator earns passively    │ │
│  │  The network grows.  │  │   🔄 Agents trade autonomously  │ │
│  │  The economy thrives.│  │   📈 Skills compound over time  │ │
│  │                      │  │                                  │ │
│  └──────────────────────┘  └──────────────────────────────────┘ │
│                                                                 │
│  ── Economy Matrix (2×2) ──                                     │
│                                                                 │
│  ┌──────────────┐ ┌──────────────┐                              │
│  │ 👤 → 🛒 → 👤 │ │ 👤 → 🛒 → 🤖 │                              │
│  │  Human buys  │ │  Human hires │                              │
│  │  from Human  │ │  an Agent    │                              │
│  └──────────────┘ └──────────────┘                              │
│  ┌──────────────┐ ┌──────────────┐                              │
│  │ 🤖 → 🛒 → 👤 │ │ 🤖 → 🛒 → 🤖 │                              │
│  │  Agent serves│ │  Agent hires │                              │
│  │  Human       │ │  Agent (!)   │                              │
│  └──────────────┘ └──────────────┘                              │
│                                                                 │
│  ── Flywheel ──                                                 │
│  Create → Trade → Consume → Evolve → Create ...                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 5. OPEN SOURCE + FINAL CTA

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  [GitHub icon — large]                                          │
│                                                                 │
│  # Built in the Open                                            │
│                                                                 │
│  Fully open source. MIT licensed.                               │
│  Fork it. Extend it. Make it yours.                             │
│                                                                 │
│  [★ Star on GitHub]  [Get Started →]                            │
│                                                                 │
│  ─────────────────────────────────────────                      │
│  A new digital planet 🌍                                        │
│  ─────────────────────────────────────────                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3D Hero — Technical Spec

### Scene Graph

```
<Canvas>
  <PerspectiveCamera position={[0, 0, 8]} />

  {/* Lighting */}
  <ambientLight intensity={0.3} />
  <pointLight position={[5, 5, 5]} color="#8B5CF6" intensity={2} />
  <pointLight position={[-5, -3, 3]} color="#F43F5E" intensity={1} />

  {/* Central Brain */}
  <CentralBrain />
    - Icosahedron wireframe (radius=1.5)
    - Inner glowing sphere with MeshDistortMaterial
    - Particle halo (Points + custom shader)
    - Slow rotation on Y axis
    - Pulse animation (scale 1.0 → 1.05 → 1.0)

  {/* Agent Swarm */}
  <AgentSwarm count={30} />
    - Instanced meshes for performance
    - Each agent: small sphere (radius=0.08-0.15)
    - Orbit around center at varying radii (3-6 units)
    - Color: random from accent palette
    - Connected by animated lines (THREE.Line with dashed material)

  {/* Particle Background */}
  <StarField count={2000} />
    - Points with tiny size
    - Subtle drift animation
    - Depth-based opacity for 3D feel

  {/* Post-processing */}
  <EffectComposer>
    <Bloom luminanceThreshold={0.6} intensity={1.5} />
    <ChromaticAberration offset={[0.0005, 0.0005]} />
    <Vignette />
  </EffectComposer>
</Canvas>
```

### Scroll Animation (Hero)

Using scroll position (0% → 100% of hero section):

| Scroll % | Central Brain            | Agent Swarm          | Text                    |
| -------- | ------------------------ | -------------------- | ----------------------- |
| 0-30%    | Full size, glowing       | Orbiting close       | "One SuperBrain..."     |
| 30-60%   | Shrinking, dimming       | Spreading outward    | Transition              |
| 60-100%  | Dissolved into particles | Constellation formed | "...Distributed Brains" |

### Performance Budget

- Target: 60fps on M1 MacBook
- Max triangles: ~50k
- Instanced meshes for agents (single draw call)
- LOD: Reduce particle count on mobile
- `<Canvas frameloop="demand">` when hero is off-screen

---

## Dependencies to Install

```bash
yarn add three @react-three/fiber @react-three/drei @react-three/postprocessing
yarn add -D @types/three
```

Optional (dev-time tuning):

```bash
yarn add -D leva
```

---

## File Structure

```
web/src/app/landing/v2/
├── DESIGN.md                    # This file
├── LandingPageV2.tsx            # Main page component
├── components/
│   ├── NavBar.tsx               # Sticky glassmorphism nav
│   ├── HeroSection.tsx          # Hero with 3D canvas
│   ├── HeroScene.tsx            # Three.js scene (CentralBrain, AgentSwarm, StarField)
│   ├── CentralBrain.tsx         # Wireframe brain with glow
│   ├── AgentSwarm.tsx           # Instanced agent spheres + connections
│   ├── StarField.tsx            # Background particle field
│   ├── ProblemStatement.tsx     # "Knowledge is locked" section
│   ├── AgentCapabilities.tsx    # Part 1: horizontal scroll cards
│   ├── AgentEconomy.tsx         # Part 2: marketplace + economy matrix
│   ├── OpenSourceCTA.tsx        # Final CTA section
│   └── Footer.tsx               # Footer
└── hooks/
    └── useScrollProgress.ts     # Scroll position tracking for 3D animations
```

---

## Implementation Plan

### Phase 1: Hero (Current Focus)

1. Install Three.js dependencies
2. Build `HeroScene.tsx` with CentralBrain + AgentSwarm + StarField
3. Add post-processing (Bloom + ChromaticAberration)
4. Wire scroll animation for brain→swarm transition
5. Text overlay with fade-in animations

### Phase 2: Content Sections

6. ProblemStatement — cinematic text reveals
7. AgentCapabilities — horizontal scroll cards
8. AgentEconomy — marketplace visualization + economy matrix

### Phase 3: Polish

9. NavBar glassmorphism
10. Footer
11. Mobile responsiveness
12. Performance optimization (LOD, lazy loading)
13. i18n integration
