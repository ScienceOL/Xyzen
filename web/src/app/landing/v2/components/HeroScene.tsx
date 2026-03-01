import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { SuperBrainOrb } from "./SuperBrainOrb";
import { AgentSociety } from "./AgentSociety";
import { StarField } from "./StarField";

function Scene() {
  return (
    <>
      {/* Lighting — cold blue left, warm violet/amber right */}
      <ambientLight intensity={0.08} />
      {/* SuperBrain lighting — cold */}
      <pointLight position={[-5, 3, -2]} color="#3B82F6" intensity={2} />
      <pointLight position={[-3, -2, -3]} color="#60A5FA" intensity={0.8} />
      {/* Society lighting — warm, from multiple angles */}
      <pointLight position={[4, 3, 2]} color="#8B5CF6" intensity={2.5} />
      <pointLight position={[2, -1, 3]} color="#F59E0B" intensity={1} />
      <pointLight position={[1, 4, 0]} color="#E0D4FF" intensity={0.6} />

      {/* Left: SuperBrain — far, cold, alone */}
      <group position={[-3, 0, -3]}>
        <SuperBrainOrb />
      </group>

      {/* Right: Agent Society — near, warm, alive, elevated */}
      <group position={[2.2, 0, 0.5]}>
        <AgentSociety />
      </group>

      {/* Background stars */}
      <StarField count={600} />
    </>
  );
}

export function HeroScene() {
  return (
    <div className="pointer-events-auto absolute inset-0">
      <Canvas
        camera={{ position: [0, 0.5, 6.5], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
