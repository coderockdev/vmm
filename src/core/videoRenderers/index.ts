import {
  RenderStyledVideoArgs,
  RenderStyledVideoResult,
  VideoStyleId,
  isFfmpegVideoStyle,
} from "./types";
import { renderScrollingText } from "./scrollingText";
import { renderCinematicText, renderMinimalist } from "./cinematicText";
import { renderHighlightedScroll, renderTeleprompter, renderKaraoke } from "./stubs";

export * from "./types";
export * from "./presets";
export * from "./stripVoiceTags";

export async function renderVideo(args: RenderStyledVideoArgs): Promise<RenderStyledVideoResult> {
  switch (args.styleId as VideoStyleId) {
    case "scrolling-text":
      return renderScrollingText(args);
    case "cinematic-text":
      return renderCinematicText(args);
    case "minimalist":
      return renderMinimalist(args);
    case "highlighted-scroll":
      return renderHighlightedScroll(args);
    case "teleprompter":
      return renderTeleprompter(args);
    case "karaoke":
      return renderKaraoke(args);
    default:
      throw new Error(`Estilo de vídeo não suportado: ${args.styleId}`);
  }
}

export { isFfmpegVideoStyle };
