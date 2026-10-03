import type { Channel } from "../../types";

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).replace(/\s+\S*$/, "").trim();
}

/**
 * One scene for every quality on this channel. The words come from that
 * channel's DNA, so a prayer channel, a story channel and an audiobook
 * do not share the same picture.
 */
export function channelComparePrompt(channel: Channel): string {
  const dna = channel.dna;
  const topics = dna.topics.filter(Boolean).slice(0, 3).join(", ");
  const tone = dna.tone.filter(Boolean).slice(0, 5).join(", ");
  const avoid = dna.avoid.filter(Boolean).slice(0, 4).join(", ");
  const ambient = dna.usesNarration === false;
  const interior = dna.visual.interiorStyleRules?.trim() || "";
  const coverStyle = dna.visual.cover?.styleRules?.trim() || "";
  const style = dna.mode === "audiobook" ? interior || coverStyle : coverStyle || interior;
  const subject = topics || clip(dna.description, 180);
  const moment = ambient
    ? `One still place, no people and no faces. What the picture shows: ${subject}.`
    : `One person or one clear moment in the middle of the frame. What the picture shows: ${subject}.`;

  return [
    "Same scene for every quality, so the comparison is the drawing and the price, not a different moment. Wide 16:9.",
    `Channel: ${channel.name}. ${clip(dna.description, 320)}`,
    tone ? `Tone: ${tone}.` : "",
    moment,
    style ? `Look: ${clip(style, 600)}` : "",
    avoid ? `Do not show: ${avoid}.` : "",
    "No letters, no captions, no logos, no watermarks.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Cover brief for this channel. A stored DNA rule wins. Otherwise the suggestion is built here and is not saved until the channel keeps it. */
export function channelCoverPrompt(channel: Channel): string {
  const own = channel.dna.visual.cover?.styleRules?.trim();
  if (own) return own;
  const dna = channel.dna;
  const topics = dna.topics.filter(Boolean).slice(0, 3).join(", ");
  const tone = dna.tone.filter(Boolean).slice(0, 5).join(", ");
  const avoid = dna.avoid.filter(Boolean).slice(0, 4).join(", ");
  return [
    `YouTube cover, 16:9, for the channel "${channel.name}".`,
    clip(dna.description, 320),
    tone ? `Tone: ${tone}.` : "",
    topics ? `The picture is about: ${topics}.` : "",
    dna.usesNarration === false ? "No people and no faces." : "One clear subject in the middle of the frame.",
    avoid ? `Do not show: ${avoid}.` : "",
    "No letters, no captions, no logos, no watermarks. Leave the lower area quieter so a short title can be added later.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
