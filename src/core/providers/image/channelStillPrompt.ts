import type { Channel } from "../../types";

/** One scene for every quality, so a comparison is about the drawing and not a different moment. */
export function channelComparePrompt(channel: Channel): string {
  if (channel.dna.mode === "audiobook") {
    const style = (channel.dna.visual.interiorStyleRules || "").slice(0, 900);
    return [
      "Same scene for a quality comparison. Classic European adventure illustration, ligne claire, clean ink, flat color, 19th century. Not a photo.",
      "A professor with round glasses, light hair and a cane stands in a stone doorway at dusk beside a young man. Wide 16:9. Faces and feet stay in the middle of the frame.",
      "No letters anywhere, including signs and buildings.",
      style,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const tone = channel.dna.tone.filter(Boolean).slice(0, 6).join(", ");
  return [
    "Same scene for a quality comparison. Illustrated, not a photo.",
    `Channel: ${channel.name}. ${channel.dna.description}`,
    tone ? `Tone: ${tone}.` : "",
    "A quiet evening room, warm light, two people sitting close, a soft prayer atmosphere. Wide 16:9. Faces stay in the middle of the frame. No letters, no captions, no logos.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
