# Hero 3D Scene — Detailed Design

## Core Narrative

The hero needs to **visually argue** one thing:

> "A single omnipotent Agent is impressive — but a network of specialized Agents is civilization."

This is a **left-right split** with depth:

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│   ← BACKGROUND / FAR                        FOREGROUND / NEAR →       │
│                                                                        │
│   ┌─────────────────────┐          ┌──────────────────────────────┐   │
│   │                     │          │                              │   │
│   │    SUPERBRAIN       │    VS    │    DISTRIBUTED NETWORK       │   │
│   │    (the old way)    │          │    (the Xyzen way)           │   │
│   │                     │          │                              │   │
│   └─────────────────────┘          └──────────────────────────────┘   │
│                                                                        │
│   Cold, monolithic,                 Warm, alive, diverse,             │
│   powerful but alone                connected and growing             │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

The **text floats in the center**, between the two worlds.

---

## Left Side — SuperBrain (远景, Background, z=-3 to -1)

### Visual

A large, cold, imposing singular brain/orb receding into the background.
It's powerful — you can see it "thinking" — but it's alone.

```
         ╭─────────────╮
         │  ░░░░░░░░░  │  ← Code waterfall streams
         │  ░░ ◉ ░░░░  │     cascading down around it
         │  ░░░░░░░░░  │
         │  ░░░░░░░░░  │
         ╰─────────────╯
              │││││
         (consuming everything)
```

### Elements

1. **Central Orb** (radius ~1.2)
   - Smooth sphere with subtle noise displacement (current shader, toned down)
   - **Cold palette**: ice blue `#60A5FA` → steel blue `#3B82F6` → white core
   - Slow rotation, slight pulse
   - Semi-transparent — it feels powerful but distant

2. **Code Waterfall** (the "thinking" visualization)
   - 6-8 vertical streams of glowing text/symbols falling around the orb
   - Like The Matrix rain but more refined — thin columns of monospace characters
   - Characters: `{ } => fn() async let const import class 0x1F 127.0.0.1`
   - Each stream: different speed, slight horizontal sway
   - **Implementation**: Multiple `<Text>` instances from drei, or a single plane with a custom shader that scrolls a texture of code characters
   - **Simpler approach**: Use CSS overlay with `position: absolute` on the left side, pure CSS animation (no Three.js cost). Monospace text columns with `@keyframes` translateY scroll. This is much cheaper than rendering text in WebGL.
   - Color: `#60A5FA` (blue-400) at 30% opacity, fading to transparent at edges
   - Glow: subtle text-shadow in CSS

3. **Containment Ring** (optional)
   - A single wireframe ring/cage around the orb
   - Suggests limitation — this brain is contained, bounded
   - Thin, subtle, slowly rotating opposite to the orb

4. **Mood**
   - Position: left-center of viewport, pushed back in z-depth
   - Slightly dimmed compared to right side (it's the "past")
   - No warm colors — strictly blue/white/grey

### Animation

- Orb rotates slowly (0.05 rad/s)
- Code streams scroll downward continuously
- Subtle pulse (scale 1.0 → 1.02 → 1.0, period 4s)
- Overall: impressive but STATIC feeling — it's one thing doing one thing

---

## Right Side — Distributed Network (近景, Foreground, z=-1 to 2)

### Visual

A living constellation of diverse agents, actively collaborating.
Each agent is different. Energy flows between them. The network is alive.

```
        ◉───────◉           ◉
       ╱ ╲     ╱ ╲         ╱│
      ◉   ◉───◉   ◉───────◉│
       ╲ ╱     ╲ ╱         ╲│
        ◉───────◉           ◉
           ↕ ↕ ↕
      (energy pulses traveling along edges)
```

### Elements

1. **Agent Nodes** (12-16 nodes)
   - Each node: a small glowing sphere (radius 0.08-0.2)
   - **Each node has a unique identity**:
     - Different sizes (some are senior agents, some are junior)
     - Different colors from the warm palette:
       - Violet `#8B5CF6` — reasoning agents
       - Rose `#F43F5E` — creative agents
       - Amber `#F59E0B` — data agents
       - Cyan `#06B6D4` — research agents
       - Emerald `#10B981` — code agents
     - Each has a tiny icon-like glyph or distinctive shape (icosahedron vs octahedron vs torus)
   - Gentle float animation — each on its own rhythm (bob up/down 0.1-0.3 units)

2. **Connection Edges** (20-25 lines)
   - Thin lines connecting agents in a network graph topology
   - NOT random — a deliberate, organic graph structure
   - Lines have soft glow, additive blending
   - Color: faint violet or white at 8-12% opacity

3. **Energy Pulses** (the "trade/collaboration" visualization) ★ KEY DIFFERENTIATOR
   - Small bright particles traveling along the connection edges
   - Like data packets flowing through a network
   - Each pulse: tiny sphere (radius 0.02) with glow
   - Travel speed: ~1-2 units/second
   - Random color matching the destination agent
   - **Implementation**: For each edge, maintain 0-2 active pulses. Each pulse has a `t` parameter (0→1) that lerps along the edge. When t reaches 1, the destination node briefly brightens (it "received" something). Then spawn a new pulse on a random edge.
   - This creates the visual story: agents are TRADING, COMMUNICATING, COLLABORATING

4. **Growth Particles** (emergence)
   - Occasionally, a node "levels up" — brief sparkle burst
   - Tiny upward-floating particles from the node
   - Happens every 3-5 seconds on a random node
   - Very subtle — just enough to show the network is alive and improving

5. **New Connection Formation** (optional, advanced)
   - Every 8-10 seconds, a new faint line appears between two previously unconnected nodes
   - Starts at 0% opacity, grows to full
   - Shows the network is growing

### Layout

- Nodes arranged in a roughly circular/organic cluster
- Center of cluster at right-center of viewport
- Occupies roughly 40-50% of viewport width
- Closer to camera than the SuperBrain (z=0 to 1)
- Slightly larger apparent size than the SuperBrain (perspective makes near things dominant)

### Animation Summary

- Nodes: gentle independent float
- Edges: static but softly glowing
- Pulses: continuous flow along edges (the star of the show)
- Growth: occasional sparkle bursts
- Overall: ALIVE, DIVERSE, DYNAMIC — many things happening in harmony

---

## Center — Text + Divide

The text sits between the two worlds:

```
                    ┌──────────────────────┐
                    │                      │
                    │    [XYZEN logo]      │
                    │                      │
                    │   One SuperBrain,    │
                    │  or Distributed      │
                    │      Brains?         │
                    │                      │
                    │   subtitle text      │
                    │                      │
                    │  [CTA]  [GitHub]     │
                    │                      │
                    └──────────────────────┘
```

- Text needs strong readability — use a semi-transparent dark backdrop behind text
- Or: use the radial gradient overlay to darken the center strip
- The "VS" energy is implied by the layout, not explicitly shown

---

## Camera & Composition

```
   Top-down view (looking from above):

   z-axis (depth, into screen →)

   z=-4   z=-2    z=0    z=2
    │       │       │       │
    │  [SB] │       │ [DN]  │
    │       │  CAM  │       │
    │       │   ↑   │       │
    │       │  eye  │       │
```

- Camera at `[0, 0.3, 6]`, looking at `[0, 0, 0]`
- FOV: 45° (tight, cinematic)
- SuperBrain group positioned at `[-2.5, 0, -2]` — left and far
- Distributed Network positioned at `[2, 0, 0.5]` — right and near
- Depth difference creates natural scale contrast

---

## Color Script

| Element          | Color                        | Feeling            |
| ---------------- | ---------------------------- | ------------------ |
| SuperBrain orb   | `#60A5FA` → `#3B82F6` (blue) | Cold, clinical     |
| SuperBrain code  | `#60A5FA` at 30%             | Technical, sterile |
| Agent nodes      | Mixed warm palette           | Diverse, alive     |
| Connection edges | `#8B5CF6` at 10%             | Subtle structure   |
| Energy pulses    | Matching destination color   | Active, trading    |
| Background       | `#07080F` deep space         | Vast, cosmic       |
| Stars            | `#c4b5fd` at 30%             | Depth, atmosphere  |

**Key principle**: Left = cold blue. Right = warm mixed. The contrast tells the story.

---

## Performance Strategy

### Budget

- Target: 60fps on M1 MacBook Air
- Max draw calls: ~10
- Max triangles: ~30k

### Implementation

| Element          | Technique                               | Draw calls |
| ---------------- | --------------------------------------- | ---------- |
| SuperBrain orb   | Single mesh + custom shader             | 1          |
| Code waterfall   | **CSS overlay, not WebGL**              | 0          |
| Containment ring | Single wireframe mesh                   | 1          |
| Agent nodes      | InstancedMesh (1 geometry, N instances) | 1          |
| Connection edges | Single LineSegments geometry            | 1          |
| Energy pulses    | InstancedMesh (tiny spheres)            | 1          |
| Star field       | Points geometry                         | 1          |
| **Total**        |                                         | **~6**     |

### Code Waterfall as CSS (not WebGL)

The code streams are TEXT — rendering text in WebGL is expensive and looks bad.
Instead, overlay a CSS layer on the left side of the hero:

```tsx
<div className="absolute left-0 top-0 h-full w-[40%] overflow-hidden pointer-events-none">
  {streams.map((stream, i) => (
    <div
      key={i}
      className="absolute font-mono text-[10px] text-blue-400/25 leading-tight animate-code-scroll"
      style={{ left: `${stream.x}%`, animationDuration: `${stream.speed}s` }}
    >
      {stream.lines.join("\n")}
    </div>
  ))}
</div>
```

```css
@keyframes code-scroll {
  0% {
    transform: translateY(-100%);
  }
  100% {
    transform: translateY(100vh);
  }
}
```

This costs almost nothing and looks great.

### Energy Pulse System

- Pre-allocate an InstancedMesh with 30 pulse slots
- Each frame, advance active pulses along their edges (simple lerp)
- When a pulse completes, mark its slot as available and spawn a new one on a random edge
- Cost: 1 draw call, 30 tiny spheres — negligible

---

## Scene Graph (React Three Fiber)

```tsx
<Canvas camera={{ position: [0, 0.3, 6], fov: 45 }}>
  {/* Lighting */}
  <ambientLight intensity={0.06} />
  <pointLight position={[-4, 2, -2]} color="#3B82F6" intensity={1.5} />
  <pointLight position={[4, 2, 2]} color="#8B5CF6" intensity={2} />
  <pointLight position={[2, -2, 1]} color="#F59E0B" intensity={0.8} />

  {/* Left: SuperBrain */}
  <group position={[-2.5, 0, -2]}>
    <SuperBrainOrb /> {/* Cold blue orb with subtle noise shader */}
    <ContainmentRing /> {/* Thin wireframe ring */}
  </group>

  {/* Right: Distributed Network */}
  <group position={[1.8, 0, 0.5]}>
    <NetworkNodes /> {/* InstancedMesh: 12-16 colored spheres */}
    <NetworkEdges /> {/* LineSegments: connection lines */}
    <EnergyPulses /> {/* InstancedMesh: traveling particles */}
  </group>

  {/* Background */}
  <StarField count={600} />
</Canvas>;

{
  /* CSS Overlay: Code Waterfall (left side only) */
}
<CodeWaterfall />;
```

---

## Responsive Behavior

### Desktop (>1024px)

- Full split layout as described above
- Both 3D worlds visible

### Tablet (768-1024px)

- SuperBrain shrinks and recedes further
- Distributed network moves slightly left
- Code waterfall thins to 3-4 streams

### Mobile (<768px)

- **Only show Distributed Network** (centered)
- SuperBrain hidden (too much for small screen)
- Code waterfall: 2 faint streams on edges
- Title stacks vertically, smaller font

---

## Alternative Approaches Considered

### A. Scroll-driven transition (rejected)

Brain → dissolves into network on scroll. Rejected because:

- Scroll-driven 3D is a performance nightmare
- User might never scroll — the "punchline" is hidden
- Both concepts should be visible simultaneously for contrast

### B. Single centered scene (current, rejecting)

One big orb in center. Rejected because:

- No narrative contrast — just a cool orb
- Orb blocks text readability
- Doesn't communicate "distributed vs centralized"

### C. Two separate canvases (considered)

One Canvas per side. Pros: independent rendering. Cons:

- Two WebGL contexts = 2x GPU cost
- Hard to share depth/lighting

### D. Chosen: Single Canvas, split composition ✅

One Canvas spanning full viewport. Two groups positioned left/right in 3D space.
Camera sees both. Depth creates natural emphasis (near = Xyzen's way).

---

## Next Steps

1. Refactor `HeroScene.tsx` to use split composition
2. Create `SuperBrainOrb.tsx` — cold blue orb (adapt existing shader, change palette)
3. Create `CodeWaterfall.tsx` — CSS overlay, not WebGL
4. Create `NetworkNodes.tsx` — InstancedMesh with diverse colors/sizes
5. Create `NetworkEdges.tsx` — static connection lines
6. Create `EnergyPulses.tsx` — particles traveling along edges ★
7. Update `HeroSection.tsx` — text positioning for split layout
8. Performance test and tune
