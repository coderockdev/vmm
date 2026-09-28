import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Palette } from "../palettes";
import { mulberry32, seededRange } from "../seededRandom";

export const ParticleField: React.FC<{ palette: Palette; seed: number }> = ({ palette, seed }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;

  const particles = useMemo(() => {
    const rng = mulberry32(seed + 3);
    return new Array(60).fill(0).map(() => ({
      x: rng() * width,
      y: rng() * height,
      radius: seededRange(rng, 1.5, 5),
      driftSpeed: seededRange(rng, 5, 18),
      driftPhase: rng() * Math.PI * 2,
      twinkleSpeed: seededRange(rng, 0.5, 1.8),
      colorPick: rng(),
    }));
  }, [seed, width, height]);

  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
      <rect width={width} height={height} fill={palette.background} />
      {particles.map((p, i) => {
        const y = ((p.y - t * p.driftSpeed) % (height + 40) + height + 40) % (height + 40);
        const x = p.x + Math.sin(t * 0.5 + p.driftPhase) * 20;
        const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(t * p.twinkleSpeed + p.driftPhase));
        const color = p.colorPick < 0.5 ? palette.accent : palette.primary;
        return <circle key={i} cx={x} cy={y - 20} r={p.radius} fill={color} opacity={twinkle * 0.85} />;
      })}
    </svg>
  );
};
