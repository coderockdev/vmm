import { Channel } from "../../types";
import { normalizeCoverDna } from "./coverFormats";

/** Builds channel-cover prompt from DNA (brand art, not per-video thumbnail). */
export function buildCoverPrompt(args: {
  name: string;
  description: string;
  tone: string[];
  topics: string[];
  palette: string;
  channel?: Channel;
}): string {
  const cover = args.channel ? normalizeCoverDna(args.channel.dna.visual?.cover) : null;
  const style = cover?.styleRules
    ? cover.styleRules
    : "Abstract, atmospheric, no text, no logos, no watermarks, cinematic lighting, square composition.";
  const avoid = cover?.avoid?.length ? `Avoid: ${cover.avoid.join(", ")}.` : "";

  return [
    `A YouTube channel cover art thumbnail for a channel called "${args.name}".`,
    `Theme: ${args.description}`,
    `Tone: ${args.tone.join(", ")}.`,
    `Visual motifs: ${args.topics.slice(0, 4).join(", ")}.`,
    `Color palette inspiration: ${args.palette}.`,
    style,
    avoid,
  ]
    .filter(Boolean)
    .join(" ");
}
