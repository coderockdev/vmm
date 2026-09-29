import { ImageProvider, ImageProviderName } from "./ImageProvider";
import { OpenAIImageProvider } from "./OpenAIImageProvider";
import { PollinationsImageProvider } from "./PollinationsImageProvider";
import { GeminiImageProvider } from "./GeminiImageProvider";

export * from "./ImageProvider";
export * from "./coverFormats";

export type ImageProviderOption = {
  id: ImageProviderName;
  label: string;
  free: boolean;
  available: boolean;
  reason?: string;
  /** Short quality/speed hint for the Portadas selector. */
  hint?: string;
};

/**
 * Runtime catalog: every free Pollinations model always on, plus the fullest
 * keyed engines (OpenAI Images + Gemini/Imagen) when their env keys exist.
 */
export function listImageProviderOptions(): ImageProviderOption[] {
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  return [
    {
      id: "pollinations",
      label: "Pollinations Flux",
      free: true,
      available: true,
      hint: "Melhor qualidade grátis · 16:9",
    },
    {
      id: "pollinations-turbo",
      label: "Pollinations Turbo",
      free: true,
      available: true,
      hint: "Mais rápido · grátis",
    },
    {
      id: "pollinations-gptimage",
      label: "Pollinations GPT-Image",
      free: true,
      available: true,
      hint: "Texto na imagem · grátis",
    },
    {
      id: "openai",
      label: "OpenAI Images",
      free: false,
      available: hasOpenAI,
      reason: hasOpenAI ? undefined : "Sem OPENAI_API_KEY",
      hint: hasOpenAI ? "Mais completo com chave · gpt-image" : undefined,
    },
    {
      id: "gemini",
      label: "Gemini / Imagen",
      free: false,
      available: hasGemini,
      reason: hasGemini ? undefined : "Sem GEMINI_API_KEY",
      hint: hasGemini ? "16:9 nativo · com chave" : undefined,
    },
  ];
}

export function resolveBestImageProvider(override?: ImageProviderName | null): ImageProviderName {
  if (override) return override;
  const env = process.env.IMAGE_PROVIDER as ImageProviderName | undefined;
  if (env) return env;
  // Prefer the most complete keyed engine when available; else best free.
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "pollinations";
}

export function getImageProvider(override?: ImageProviderName | null): ImageProvider {
  const name = resolveBestImageProvider(override);

  switch (name) {
    case "openai":
      return new OpenAIImageProvider();
    case "gemini":
      return new GeminiImageProvider();
    case "pollinations-turbo":
      return new PollinationsImageProvider("pollinations-turbo");
    case "pollinations-gptimage":
      return new PollinationsImageProvider("pollinations-gptimage");
    case "pollinations":
    default:
      return new PollinationsImageProvider("pollinations");
  }
}

export { buildCoverPrompt } from "./buildCoverPrompt";
