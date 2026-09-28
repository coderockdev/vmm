import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Palette } from "../palettes";
import { mulberry32, seededRange } from "../seededRandom";

export const FlowingWaves: React.FC<{ palette: Palette; seed: number }> = ({ palette, seed }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;

  const waves = useMemo(() => {
    const rng = mulberry32(seed + 2);
    return new Array(4).fill(0).map((_, i) => ({
      amplitude: seededRange(rng, height * 0.03, height * 0.09),
      wavelength: seededRange(rng, width * 0.6, width * 1.4),
      phase: rng() * Math.PI * 2,
      baseline: height * (0.35 + i * 0.16),
      speed: seededRange(rng, 0.15, 0.35) * (i % 2 === 0 ? 1 : -1),
    }));
  }, [seed, width, height]);

  function wavePath(w: (typeof waves)[number]) {
    const points: string[] = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const x = (width / steps) * i;
      const y =
        w.baseline +
        Math.sin((x / w.wavelength) * Math.PI * 2 + t * w.speed * Math.PI * 2 + w.phase) * w.amplitude;
      points.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    points.push(`L${width},${height}`, `L0,${height}`, "Z");
    return points.join(" ");
  }

  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
      <rect width={width} height={height} fill={palette.background} />
      {waves.map((w, i) => (
        <path
          key={i}
          d={wavePath(w)}
          fill={i % 2 === 0 ? palette.primary : palette.secondary}
          opacity={0.22 + i * 0.05}
        />
      ))}
    </svg>
  );
};
