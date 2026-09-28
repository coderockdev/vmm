import React from "react";
import { Composition } from "remotion";
import { NeonMeditationComposition, NeonMeditationProps } from "./NeonMeditationComposition";

const FPS = 30;

const DEFAULT_PROPS: NeonMeditationProps = {
  lines: [{ text: "Preview", start: 0, end: 3, pauseAfter: 0 }],
  paletteId: "cosmic",
  textPreset: "bold-scroll",
  seed: 1,
  durationInSeconds: 10,
  audioFileName: null,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="NeonMeditationVideo"
        component={NeonMeditationComposition}
        durationInFrames={FPS * 10}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={DEFAULT_PROPS}
        calculateMetadata={async ({ props }) => ({
          durationInFrames: Math.max(1, Math.round(props.durationInSeconds * FPS)),
        })}
      />
      <Composition
        id="NeonMeditationShort"
        component={NeonMeditationComposition}
        durationInFrames={FPS * 10}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={DEFAULT_PROPS}
        calculateMetadata={async ({ props }) => ({
          durationInFrames: Math.max(1, Math.round(props.durationInSeconds * FPS)),
        })}
      />
    </>
  );
};
