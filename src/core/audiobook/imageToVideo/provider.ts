import { ImageToVideoProviderId } from "../../types";

export interface ImageToVideoRequest {
  imageRef: string;
  prompt: string;
  durationSec: number;
  model: string;
}

export interface ImageToVideoResult {
  provider: ImageToVideoProviderId;
  model: string;
  durationSec: number;
  estimatedUsd: number | null;
  actualUsd: number | null;
  generationMs: number | null;
  previewUrl: string | null;
  quality: string | null;
  configured: boolean;
  message: string;
}

export interface ImageToVideoProvider {
  id: ImageToVideoProviderId;
  label: string;
  models: string[];
  isConfigured(): boolean;
  generateImageToVideo(request: ImageToVideoRequest): Promise<ImageToVideoResult>;
}

function stub(id: ImageToVideoProviderId, label: string, models: string[], envKey: string): ImageToVideoProvider {
  return {
    id,
    label,
    models,
    isConfigured: () => Boolean(process.env[envKey]?.trim()),
    async generateImageToVideo(request) {
      const configured = Boolean(process.env[envKey]?.trim());
      return {
        provider: id,
        model: request.model || models[0],
        durationSec: request.durationSec,
        estimatedUsd: id === "fal" ? 0.1 : null,
        actualUsd: null,
        generationMs: null,
        previewUrl: null,
        quality: null,
        configured,
        message: configured
          ? `${label} está ligado, mas a chamada ainda não está feita. O laboratório não gasta sozinho.`
          : `${label} ainda não tem chave. Nada foi gerado.`,
      };
    },
  };
}

export const IMAGE_TO_VIDEO_PROVIDERS: ImageToVideoProvider[] = [
  stub("fal", "Fal", ["fal-ai/wan/v2.2-a14b/image-to-video/turbo"], "FAL_KEY"),
  stub("runway", "Runway", ["gen3a_turbo", "gen4_turbo"], "RUNWAY_API_KEY"),
  stub("kling", "Kling", ["kling-v1-6", "kling-v2"], "KLING_API_KEY"),
  stub("luma", "Luma", ["ray-2", "ray-flash-2"], "LUMA_API_KEY"),
  stub("pika", "Pika", ["pika-2.2"], "PIKA_API_KEY"),
];

export function listImageToVideoProviders(): Array<{
  id: ImageToVideoProviderId;
  label: string;
  models: string[];
  configured: boolean;
}> {
  return IMAGE_TO_VIDEO_PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    models: provider.models,
    configured: provider.isConfigured(),
  }));
}

export function getImageToVideoProvider(id: string): ImageToVideoProvider | null {
  return IMAGE_TO_VIDEO_PROVIDERS.find((provider) => provider.id === id) ?? null;
}
