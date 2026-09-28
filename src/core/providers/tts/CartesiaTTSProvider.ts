import path from "path";
import fs from "fs";
import { TTSProvider, SynthesizeArgs, SynthesizeResult } from "./TTSProvider";
import { ffprobeDuration } from "../../audio/ffmpegUtils";

const DEFAULT_VOICE_ID = "c9611be8-aae9-4a93-bb1c-98dd6b7d52a4"; // "Isabella" (pt-BR)
const API_VERSION = "2026-08-14";

/**
 * Cartesia (Sonic model) — the primary narration engine for VMM. Chosen over
 * ElevenLabs for cost (~5x cheaper per minute) at comparable quality, with
 * native pt-BR and es voices. Selected via TTS_PROVIDER=cartesia (default)
 * or per-generation override, same seam as every other TTSProvider.
 */
export class CartesiaTTSProvider implements TTSProvider {
  readonly name = "cartesia" as const;

  async synthesize(args: SynthesizeArgs): Promise<SynthesizeResult> {
    const apiKey = process.env.CARTESIA_API_KEY;
    if (!apiKey) {
      throw new Error(
        "CARTESIA_API_KEY is not set. Add it to your .env.local to use the Cartesia narration option."
      );
    }

    const voiceId = args.voiceId || DEFAULT_VOICE_ID;
    const finalPath = path.join(args.outDir, `${args.fileBaseName}.mp3`);

    const response = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "Cartesia-Version": API_VERSION,
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: "sonic-3.6",
        transcript: args.text,
        voice: { id: voiceId },
        language: args.language,
        generation_config: { speed: clampSpeed(args.speed) },
        output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Cartesia TTS request failed (${response.status}): ${body.slice(0, 500)}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    fs.mkdirSync(args.outDir, { recursive: true });
    fs.writeFileSync(finalPath, Buffer.from(arrayBuffer));

    const durationSeconds = await ffprobeDuration(finalPath);
    return { filePath: finalPath, durationSeconds, provider: this.name };
  }
}

function clampSpeed(speed: number): number {
  // Cartesia's generation_config.speed accepts [0.6, 1.5].
  return Math.min(1.5, Math.max(0.6, speed));
}
