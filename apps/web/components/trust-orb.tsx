"use client";

import { Canvas } from "@react-three/fiber";
import { Environment, Float, MeshDistortMaterial } from "@react-three/drei";
import { useEffect, useState } from "react";

type TrustOrbTone = "sealed" | "managed" | "broadcast";

type TrustOrbProps = {
  ghostMode?: boolean;
  queuedCount?: number;
  typing?: boolean;
  unreadCount?: number;
  tone?: TrustOrbTone;
};

function Orb({
  coreColor,
  haloColor,
  distort,
  speed,
  floatIntensity,
  haloOpacity,
}: {
  coreColor: string;
  haloColor: string;
  distort: number;
  speed: number;
  floatIntensity: number;
  haloOpacity: number;
}) {
  return (
    <Float speed={speed * 0.75} rotationIntensity={0.65} floatIntensity={floatIntensity}>
      <mesh>
        <icosahedronGeometry args={[1.4, 8]} />
        <MeshDistortMaterial
          color={coreColor}
          distort={distort}
          speed={speed}
          roughness={0.08}
          metalness={0.6}
          transparent
          opacity={0.92}
        />
      </mesh>
      <mesh scale={1.7}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color={haloColor} transparent opacity={haloOpacity} />
      </mesh>
    </Float>
  );
}

export function TrustOrb({
  ghostMode = true,
  queuedCount = 0,
  typing = false,
  unreadCount = 0,
  tone = "sealed",
}: TrustOrbProps) {
  const [canRender3d, setCanRender3d] = useState(false);

  useEffect(() => {
    try {
      setCanRender3d(Boolean(window.WebGLRenderingContext));
    } catch {
      setCanRender3d(false);
    }
  }, []);

  const activityLevel = Math.min(1, (queuedCount + unreadCount) / 8);
  const coreColor =
    tone === "broadcast" ? "#FF8B78" : tone === "managed" ? "#98FFD5" : "#5DE4FF";
  const haloColor = ghostMode ? "#A58BFF" : tone === "broadcast" ? "#5DE4FF" : "#FF7A6E";
  const distort = typing ? 0.34 : ghostMode ? 0.28 : 0.22;
  const speed = typing ? 2.8 : 1.9 + activityLevel * 0.7;
  const floatIntensity = typing ? 1.8 : 1.25 + activityLevel * 0.55;
  const haloOpacity = 0.08 + activityLevel * 0.06;
  const frameBackground = `radial-gradient(circle at top, ${coreColor}26, transparent 44%), radial-gradient(circle at 72% 26%, ${haloColor}26, transparent 30%), rgba(255,255,255,0.02)`;

  if (!canRender3d) {
    return (
      <div
        className="relative h-[300px] w-full overflow-hidden rounded-[32px] border border-white/10 shadow-[0_30px_120px_rgba(5,10,18,0.45)]"
        style={{ background: frameBackground }}
      >
        <div
          className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[2px]"
          style={{
            background: `radial-gradient(circle, ${coreColor}e6, ${coreColor}2b 45%, transparent 70%)`,
          }}
        />
        <div
          className="absolute left-[58%] top-[42%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full blur-xl"
          style={{
            background: `radial-gradient(circle, ${haloColor}4d, transparent 68%)`,
          }}
        />
        <div className="absolute inset-x-5 bottom-5 flex items-center justify-between rounded-full border border-white/10 bg-black/20 px-4 py-2 text-[11px] tracking-[0.22em] text-white/55">
          <span>{ghostMode ? "GHOST" : "OPEN"}</span>
          <span>{typing ? "LIVE" : tone.toUpperCase()}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative h-[300px] w-full overflow-hidden rounded-[32px] border border-white/10 shadow-[0_30px_120px_rgba(5,10,18,0.45)]"
      style={{ background: frameBackground }}
    >
      <Canvas camera={{ position: [0, 0, 4.5], fov: 45 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 2, 5]} intensity={3.5} color="#E7FBFF" />
        <pointLight position={[-4, -2, 3]} intensity={3.1} color={haloColor} />
        <Environment preset="city" />
        <Orb
          coreColor={coreColor}
          haloColor={haloColor}
          distort={distort}
          speed={speed}
          floatIntensity={floatIntensity}
          haloOpacity={haloOpacity}
        />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-5 bottom-5 flex items-center justify-between rounded-full border border-white/10 bg-black/20 px-4 py-2 text-[11px] tracking-[0.22em] text-white/55">
        <span>{ghostMode ? "GHOST MODE" : "VISIBLE"}</span>
        <span>{typing ? "TYPING" : `${queuedCount} QUEUED`}</span>
      </div>
    </div>
  );
}
