"use client";

import { Canvas } from "@react-three/fiber";
import { Environment, Float, MeshDistortMaterial } from "@react-three/drei";
import { useEffect, useState } from "react";

function Orb() {
  return (
    <Float speed={1.7} rotationIntensity={0.6} floatIntensity={1.4}>
      <mesh>
        <icosahedronGeometry args={[1.4, 8]} />
        <MeshDistortMaterial
          color="#5DE4FF"
          distort={0.26}
          speed={2.1}
          roughness={0.08}
          metalness={0.6}
          transparent
          opacity={0.92}
        />
      </mesh>
      <mesh scale={1.7}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color="#FF7A6E" transparent opacity={0.08} />
      </mesh>
    </Float>
  );
}

export function TrustOrb() {
  const [canRender3d, setCanRender3d] = useState(false);

  useEffect(() => {
    try {
      setCanRender3d(Boolean(window.WebGLRenderingContext));
    } catch {
      setCanRender3d(false);
    }
  }, []);

  if (!canRender3d) {
    return (
      <div className="relative h-[300px] w-full overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(93,228,255,0.16),_transparent_45%),radial-gradient(circle_at_70%_25%,_rgba(255,122,110,0.18),_transparent_28%),rgba(255,255,255,0.02)] shadow-[0_30px_120px_rgba(5,10,18,0.45)]">
        <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(93,228,255,0.9),_rgba(93,228,255,0.15)_45%,_transparent_70%)] blur-[2px]" />
        <div className="absolute left-[58%] top-[42%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(255,122,110,0.28),_transparent_68%)] blur-xl" />
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(93,228,255,0.16),_transparent_45%),radial-gradient(circle_at_70%_25%,_rgba(255,122,110,0.18),_transparent_28%),rgba(255,255,255,0.02)] shadow-[0_30px_120px_rgba(5,10,18,0.45)]">
      <Canvas camera={{ position: [0, 0, 4.5], fov: 45 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 2, 5]} intensity={3.5} color="#E7FBFF" />
        <pointLight position={[-4, -2, 3]} intensity={3.1} color="#FF7A6E" />
        <Environment preset="city" />
        <Orb />
      </Canvas>
    </div>
  );
}
