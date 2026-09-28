import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Palette } from "../palettes";
import { mulberry32, seededRange } from "../seededRandom";

export const RadialMandala: React.FC<{ palette: Palette; seed: number }> = ({ palette, seed }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const cx = width / 2;
  const cy = height / 2;
  const t = frame / fps;

  const petals = useMemo(() => {
    const rng = mulberry32(seed + 1);
    const count = 8 + Math.floor(rng() * 5);
    return new Array(count).fill(0).map((_, i) => ({
      angleOffset: (i / count) * Math.PI * 2,
      lengthFactor: seededRange(rng, 0.55, 0.95),
    }));
  }, [seed]);

  const rotation = (t * 6) % 360;
  const pulse = 1 + Math.sin(t * 1.2) * 0.06;

  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
      <rect width={width} height={height} fill={palette.background} />
      <g transform={`translate(${cx} ${cy}) rotate(${rotation}) scale(${pulse})`}>
        {petals.map((petal, i) => {
          const r = Math.min(width, height) * 0.42 * petal.lengthFactor;
          const angle = petal.angleOffset;
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r;
          const color = i % 2 === 0 ? palette.primary : palette.secondary;
          return (
            <ellipse
              key={i}
              cx={x}
              cy={y}
              rx={r * 0.32}
              ry={r * 0.12}
              transform={`rotate(${(angle * 180) / Math.PI} ${x} ${y})`}
              fill={color}
              opacity={0.55}
            />
          );
        })}
        <circle r={Math.min(width, height) * 0.05} fill={palette.accent} opacity={0.8} />
      </g>
    </svg>
  );
};
