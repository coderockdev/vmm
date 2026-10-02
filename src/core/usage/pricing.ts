import { UsageSnapshot } from "./types";

/**
 * Snapshot prices used to estimate USD at generation time.
 * Override via env without redeploying catalog logic:
 *   PRICING_ANTHROPIC_INPUT_PER_MTOK=3
 *   PRICING_ANTHROPIC_OUTPUT_PER_MTOK=15
 *   PRICING_OPENAI_INPUT_PER_MTOK=2.5
 *   PRICING_OPENAI_OUTPUT_PER_MTOK=10
 *   PRICING_GEMINI_INPUT_PER_MTOK=0.15
 *   PRICING_GEMINI_OUTPUT_PER_MTOK=0.6
 *   PRICING_CARTESIA_PER_1K_CHARS=0.015
 *   PRICING_ELEVENLABS_PER_1K_CHARS=0.12
 *   PRICING_LAMBDA_PER_MIN=0.05
 *   PRICING_OPENAI_IMAGE_PER_IMAGE=0.04
 *   PRICING_GEMINI_IMAGE_PER_IMAGE=0.04
 */
function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const PRICES = {
  anthropicInputPerMTok: () => numEnv("PRICING_ANTHROPIC_INPUT_PER_MTOK", 3),
  anthropicOutputPerMTok: () => numEnv("PRICING_ANTHROPIC_OUTPUT_PER_MTOK", 15),
  openaiInputPerMTok: () => numEnv("PRICING_OPENAI_INPUT_PER_MTOK", 2.5),
  openaiOutputPerMTok: () => numEnv("PRICING_OPENAI_OUTPUT_PER_MTOK", 10),
  geminiInputPerMTok: () => numEnv("PRICING_GEMINI_INPUT_PER_MTOK", 0.15),
  geminiOutputPerMTok: () => numEnv("PRICING_GEMINI_OUTPUT_PER_MTOK", 0.6),
  cartesiaPer1kChars: () => numEnv("PRICING_CARTESIA_PER_1K_CHARS", 0.015),
  elevenlabsPer1kChars: () => numEnv("PRICING_ELEVENLABS_PER_1K_CHARS", 0.12),
  lambdaPerMin: () => numEnv("PRICING_LAMBDA_PER_MIN", 0.05),
  /** gpt-image-1 medium / typical single image estimate. */
  openaiImagePerImage: () => numEnv("PRICING_OPENAI_IMAGE_PER_IMAGE", 0.04),
  /** Imagen 3 / Gemini image generation per image. */
  geminiImagePerImage: () => numEnv("PRICING_GEMINI_IMAGE_PER_IMAGE", 0.04),
  /** Wan 2.2 A14B Turbo is a flat fee per clip, not per second. */
  falWanTurbo480p: () => numEnv("PRICING_FAL_WAN_TURBO_480P", 0.05),
  falWanTurbo580p: () => numEnv("PRICING_FAL_WAN_TURBO_580P", 0.075),
  falWanTurbo720p: () => numEnv("PRICING_FAL_WAN_TURBO_720P", 0.1),
};

function tokensUsd(input: number, output: number, inPerM: number, outPerM: number): number {
  return (input / 1_000_000) * inPerM + (output / 1_000_000) * outPerM;
}

/** Estimate USD from a usage snapshot using the current price table. */
export function estimateUsd(snapshot: UsageSnapshot): number {
  const input = snapshot.inputTokens ?? 0;
  const output = snapshot.outputTokens ?? 0;
  const chars = snapshot.characters ?? 0;
  const minutes = (snapshot.durationSeconds ?? 0) / 60;
  const images = snapshot.images ?? 0;

  switch (snapshot.provider) {
    case "anthropic":
      return tokensUsd(input, output, PRICES.anthropicInputPerMTok(), PRICES.anthropicOutputPerMTok());
    case "openai":
      if (images > 0) return images * PRICES.openaiImagePerImage();
      if (/mini/i.test(snapshot.model || "")) {
        return tokensUsd(input, output, 0.15, 0.6);
      }
      return tokensUsd(input, output, PRICES.openaiInputPerMTok(), PRICES.openaiOutputPerMTok());
    case "gemini":
      if (images > 0) return images * PRICES.geminiImagePerImage();
      return tokensUsd(input, output, PRICES.geminiInputPerMTok(), PRICES.geminiOutputPerMTok());
    case "cartesia":
      return (chars / 1000) * PRICES.cartesiaPer1kChars();
    case "elevenlabs":
    case "heygen":
      return (chars / 1000) * PRICES.elevenlabsPer1kChars();
    case "remotion-lambda":
      return minutes * PRICES.lambdaPerMin();
    case "fal": {
      const clips = Math.max(1, snapshot.images ?? 1);
      const model = snapshot.model || "";
      const resolution = /480p/i.test(model) ? "480p" : /580p/i.test(model) ? "580p" : "720p";
      const each =
        resolution === "480p"
          ? PRICES.falWanTurbo480p()
          : resolution === "580p"
            ? PRICES.falWanTurbo580p()
            : PRICES.falWanTurbo720p();
      return clips * each;
    }
    case "pollinations":
    case "local":
    case "mock":
    case "uploaded":
    case "youtube":
    default:
      return 0;
  }
}
