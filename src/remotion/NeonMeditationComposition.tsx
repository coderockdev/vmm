import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ScriptLine, PaletteId, TextPresetId } from "../core/types";
import { getPalette } from "./palettes";
import { buildBackgroundSchedule, BackgroundId } from "./backgroundSchedule";
import { NeonTunnel } from "./backgrounds/NeonTunnel";
import { RadialMandala } from "./backgrounds/RadialMandala";
import { FlowingWaves } from "./backgrounds/FlowingWaves";
import { ParticleField } from "./backgrounds/ParticleField";
import { SyncedText } from "./SyncedText";

export interface NeonMeditationProps {
  lines: ScriptLine[];
  paletteId: PaletteId;
  textPreset: TextPresetId;
  seed: number;
  durationInSeconds: number;
  /**
   * Either a path relative to public/ (resolved via staticFile() — local
   * renders) or a full https URL (S3 presigned URL — Lambda renders, where
   * the worker has no access to our local bundle's public folder).
   */
  audioFileName: string | null;
  [key: string]: unknown;
}

const CROSSFADE_SEC = 1.4;

function renderBackground(id: BackgroundId, palette: ReturnType<typeof getPalette>, seed: number) {
  switch (id) {
    case "neon-tunnel":
      return <NeonTunnel palette={palette} seed={seed} />;
    case "radial-mandala":
      return <RadialMandala palette={palette} seed={seed} />;
    case "flowing-waves":
      return <FlowingWaves palette={palette} seed={seed} />;
    case "particle-field":
      return <ParticleField palette={palette} seed={seed} />;
  }
}

export const NeonMeditationComposition: React.FC<NeonMeditationProps> = ({
  lines,
  paletteId,
  textPreset,
  seed,
  durationInSeconds,
  audioFileName,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const palette = getPalette(paletteId);

  const schedule = React.useMemo(
    () => buildBackgroundSchedule(durationInSeconds, seed),
    [durationInSeconds, seed]
  );

  return (
    <AbsoluteFill style={{ backgroundColor: palette.background }}>
      {schedule.map((segment, i) => {
        const fadeInStart = segment.startSec;
        const fadeInEnd = Math.min(segment.startSec + CROSSFADE_SEC, segment.endSec);
        const fadeOutStart = Math.max(segment.endSec - CROSSFADE_SEC, segment.startSec);
        const fadeOutEnd = segment.endSec;

        let opacity = 0;
        if (t >= fadeInStart && t <= fadeOutEnd) {
          if (t < fadeInEnd && i !== 0) {
            opacity = (t - fadeInStart) / Math.max(fadeInEnd - fadeInStart, 0.001);
          } else if (t > fadeOutStart && i !== schedule.length - 1) {
            opacity = 1 - (t - fadeOutStart) / Math.max(fadeOutEnd - fadeOutStart, 0.001);
          } else {
            opacity = 1;
          }
        }
        if (opacity <= 0.001) return null;

        return (
          <AbsoluteFill key={i} style={{ opacity }}>
            {renderBackground(segment.id, palette, seed + i * 101)}
          </AbsoluteFill>
        );
      })}

      {textPreset !== "none" && <SyncedText lines={lines} palette={palette} />}

      {audioFileName && (
        <Audio src={audioFileName.startsWith("http") ? audioFileName : staticFile(audioFileName)} />
      )}
    </AbsoluteFill>
  );
};
