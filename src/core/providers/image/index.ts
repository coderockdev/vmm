import { ImageProvider, ImageProviderName } from "./ImageProvider";
import { OpenAIImageProvider } from "./OpenAIImageProvider";
import { PollinationsImageProvider } from "./PollinationsImageProvider";
import { GeminiImageProvider } from "./GeminiImageProvider";

export * from "./ImageProvider";
export * from "./coverFormats";

export function getImageProvider(override?: ImageProviderName | null): ImageProvider {
  const name =
    override ||
    (process.env.IMAGE_PROVIDER as ImageProviderName | undefined) ||
    (process.env.OPENAI_API_KEY ? "openai" : "pollinations");

  switch (name) {
    case "openai":
      return new OpenAIImageProvider();
    case "gemini":
      return new GeminiImageProvider();
    case "pollinations":
    default:
      return new PollinationsImageProvider();
  }
}

export { buildCoverPrompt } from "./buildCoverPrompt";
