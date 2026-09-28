import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { ScriptLine } from "../core/types";
import { Palette } from "./palettes";

function findActiveIndex(lines: ScriptLine[], t: number): number {
  for (let i = 0; i < lines.length; i++) {
    if (t >= lines[i].start && t < lines[i].end + lines[i].pauseAfter) return i;
  }
  return t < lines[0]?.start ? -1 : lines.length - 1;
}

const LINE_HEIGHT = 96;

export const SyncedText: React.FC<{ lines: ScriptLine[]; palette: Palette }> = ({ lines, palette }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const t = frame / fps;

  if (lines.length === 0) return null;

  const activeIndex = findActiveIndex(lines, t);
  if (activeIndex === -1) return null;

  const active = lines[activeIndex];
  const localProgress = interpolate(t, [active.start, Math.min(active.start + 0.35, active.end)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const enterOffset = interpolate(localProgress, [0, 1], [LINE_HEIGHT * 0.4, 0]);
  const enterOpacity = interpolate(localProgress, [0, 1], [0, 1]);

  const rows: Array<{ text: string; role: "prev" | "current" | "next" }> = [
    { text: lines[activeIndex - 1]?.text ?? "", role: "prev" },
    { text: active.text, role: "current" },
    { text: lines[activeIndex + 1]?.text ?? "", role: "next" },
  ];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: "0 8%",
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
        textAlign: "center",
      }}
    >
      {rows.map((row, i) => {
        if (!row.text) return <div key={i} style={{ height: row.role === "current" ? 64 : 34 }} />;
        const isCurrent = row.role === "current";
        return (
          <div
            key={i}
            style={{
              fontSize: isCurrent ? 64 : 34,
              fontWeight: isCurrent ? 800 : 500,
              color: palette.textColor,
              opacity: isCurrent ? enterOpacity : 0.38,
              transform: isCurrent ? `translateY(${enterOffset}px)` : "none",
              textShadow: isCurrent ? `0 0 28px ${palette.glow}` : "none",
              maxWidth: width * 0.82,
              lineHeight: 1.25,
              letterSpacing: isCurrent ? -0.5 : 0,
            }}
          >
            {row.text}
          </div>
        );
      })}
    </div>
  );
};
