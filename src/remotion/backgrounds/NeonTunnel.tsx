import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Palette } from "../palettes";
import { mulberry32 } from "../seededRandom";

export const NeonTunnel: React.FC<{ palette: Palette; seed: number }> = ({ palette, seed }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const cx = width / 2;
  const cy = height / 2;

  const rings = useMemo(() => {
    const rng = mulberry32(seed);
    return new Array(14).fill(0).map((_, i) => ({
      offset: rng() * 2,
      hueShift: rng() * 30 - 15,
    }));
  }, [seed]);

  const t = frame / fps;

  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <radialGradient id="tunnelBg" cx="50%" cy="50%" r="75%">
          <stop offset="0%" stopColor={palette.background} />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>
      </defs>
      <rect width={width} height={height} fill="url(#tunnelBg)" />
      {rings.map((ring, i) => {
        const progress = ((t * 0.35 + ring.offset + i / rings.length) % 1) * 1;
        const scale = progress * 1.6;
        const radius = Math.max(width, height) * 0.55 * scale;
        const opacity = Math.max(0, 1 - progress * 1.1);
        const color = i % 2 === 0 ? palette.primary : palette.secondary;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={Math.max(2, 10 * (1 - progress))}
            opacity={opacity * 0.8}
          />
        );
      })}
      <circle cx={cx} cy={cy} r={Math.min(width, height) * 0.08} fill={palette.accent} opacity={0.5} />
    </svg>
  );
};
