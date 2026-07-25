"use client";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useTheme } from "next-themes";

export const VantaBackground = () => {
  const [vantaEffect, setVantaEffect] = useState<any>(null);
  const vantaRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let effect: any;
    const initVanta = async () => {
      if (!vantaEffect && vantaRef.current) {
        // @ts-ignore
        const NET = (await import("vanta/dist/vanta.net.min")).default;
        effect = NET({
          el: vantaRef.current,
          THREE: THREE,
          color: 0x00529C, // DUE Blue
          backgroundColor: resolvedTheme === "dark" ? 0x020617 : 0xffffff,
          points: 12.0,
          maxDistance: 22.0,
          spacing: 18.0,
          showDots: true,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200.0,
          minWidth: 200.0,
          scale: 1.0,
          scaleMobile: 1.0
        });
        setVantaEffect(effect);
      }
    };
    initVanta();
    
    return () => {
      if (effect) effect.destroy();
    };
  }, []);

  useEffect(() => {
    if (vantaEffect) {
      vantaEffect.setOptions({
        backgroundColor: resolvedTheme === "dark" ? 0x020617 : 0xffffff,
        color: resolvedTheme === "dark" ? 0x3b82f6 : 0x00529C,
      });
    }
  }, [resolvedTheme, vantaEffect]);

  return <div ref={vantaRef} className="fixed inset-0 z-0 pointer-events-auto opacity-40" />;
};
