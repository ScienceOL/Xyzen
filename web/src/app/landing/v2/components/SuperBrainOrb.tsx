import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  Vertex shader: organic noise displacement (v1 style, 3 octaves)   */
/* ------------------------------------------------------------------ */

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uDistort;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec3 pos = position;

    // 3-octave noise — same as v1 for strong organic feel
    float noise1 = snoise(pos * 1.5 + uTime * 0.3) * 0.5;
    float noise2 = snoise(pos * 3.0 + uTime * 0.5) * 0.25;
    float noise3 = snoise(pos * 6.0 + uTime * 0.2) * 0.125;
    float displacement = (noise1 + noise2 + noise3) * uDistort;

    pos += normal * displacement;
    vDisplacement = displacement;
    vPosition = pos;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

/* ------------------------------------------------------------------ */
/*  Fragment shader: v1 violet palette, deep blue-violet center       */
/* ------------------------------------------------------------------ */

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = 1.0 - abs(dot(viewDir, vNormal));
    fresnel = pow(fresnel, 2.5);

    // Color mix based on displacement + time (v1 style)
    float t = vDisplacement * 3.0 + uTime * 0.1;
    vec3 color = mix(uColor1, uColor2, smoothstep(-0.3, 0.3, sin(t * 2.0)));
    color = mix(color, uColor3, fresnel * 0.6);

    // Deep blue-violet core glow — NOT white
    vec3 coreTint = vec3(0.18, 0.12, 0.45); // deep indigo-violet
    float core = 1.0 - fresnel;
    core = pow(core, 1.5) * 0.35;

    // Combine: v1 edge brightness + tinted core
    vec3 finalColor = color * (0.6 + fresnel * 1.2) + coreTint * core;

    gl_FragColor = vec4(finalColor, uOpacity * (0.7 + fresnel * 0.3));
  }
`;

/* ------------------------------------------------------------------ */
/*  Component: v1 structure — orb + wireframe shells + particle halo  */
/* ------------------------------------------------------------------ */

export function SuperBrainOrb() {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const wireframe1Ref = useRef<THREE.Mesh>(null);
  const wireframe2Ref = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Points>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDistort: { value: 0.18 },
      uColor1: { value: new THREE.Color("#7c3aed") }, // violet-600
      uColor2: { value: new THREE.Color("#a78bfa") }, // violet-400
      uColor3: { value: new THREE.Color("#e0d4ff") }, // light violet
      uOpacity: { value: 0.92 },
    }),
    [],
  );

  // Particle halo around the brain
  const haloData = useMemo(() => {
    const count = 200;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.4 + Math.random() * 0.6;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    return { positions, count };
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    uniforms.uTime.value = t;

    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.08;
    }

    if (meshRef.current) {
      meshRef.current.rotation.x = Math.sin(t * 0.05) * 0.1;
      // Pulse
      const pulse = 1 + Math.sin(t * 2) * 0.02;
      meshRef.current.scale.setScalar(pulse);
    }

    if (wireframe1Ref.current) {
      wireframe1Ref.current.rotation.x = t * 0.06;
      wireframe1Ref.current.rotation.z = t * 0.04;
    }

    if (wireframe2Ref.current) {
      wireframe2Ref.current.rotation.y = -t * 0.03;
      wireframe2Ref.current.rotation.x = t * 0.02;
    }

    if (haloRef.current) {
      haloRef.current.rotation.y = -t * 0.05;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Inner core orb — custom shader with organic distortion */}
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1.1, 64]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          side={THREE.FrontSide}
        />
      </mesh>

      {/* Wireframe icosahedron shell — inner */}
      <mesh ref={wireframe1Ref}>
        <icosahedronGeometry args={[1.5, 1]} />
        <meshBasicMaterial
          color="#a78bfa"
          wireframe
          transparent
          opacity={0.15}
        />
      </mesh>

      {/* Wireframe icosahedron shell — outer, slower */}
      <mesh ref={wireframe2Ref} rotation={[0.3, 0.5, 0]}>
        <icosahedronGeometry args={[1.8, 0]} />
        <meshBasicMaterial
          color="#c4b5fd"
          wireframe
          transparent
          opacity={0.07}
        />
      </mesh>

      {/* Particle halo */}
      <points ref={haloRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[haloData.positions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.025}
          color="#c4b5fd"
          transparent
          opacity={0.3}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
