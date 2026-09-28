import { ImageProvider } from "./ImageProvider";
import { OpenAIImageProvider } from "./OpenAIImageProvider";

export * from "./ImageProvider";

export function getImageProvider(): ImageProvider {
  return new OpenAIImageProvider();
}

/** Builds a cover-art prompt from the channel's own DNA — no separate input needed. */
export function buildCoverPrompt(args: {
  name: string;
  description: string;
  tone: string[];
  topics: string[];
  palette: string;
}): string {
  return [
    `A YouTube channel cover art thumbnail for a channel called "${args.name}".`,
    `Theme: ${args.description}`,
    `Tone: ${args.tone.join(", ")}.`,
    `Visual motifs: ${args.topics.slice(0, 4).join(", ")}.`,
    `Color palette inspiration: ${args.palette}.`,
    "Abstract, atmospheric, no text, no logos, no watermarks, cinematic lighting, square composition.",
  ].join(" ");
}
