import path from "path";
import fs from "fs";
import { TTSProvider, SynthesizeArgs, SynthesizeResult } from "./TTSProvider";
import { ffprobeDuration } from "../../audio/ffmpegUtils";

/**
 * Real ElevenLabs TTS integration. Requires ELEVENLABS_API_KEY. Selected via
 * TTS_PROVIDER=elevenlabs (channel default) or a per-generation override, so
 * you can render the same script through `say` and through ElevenLabs and
 * compare which narration sounds better before committing to one.
 *
 * Never falls back to a hard-coded voice (old Rachel default produced the wrong
 * gender when Amor Amor / HeyGen Juan Carlos had no voice_id).
 */
export class ElevenLabsTTSProvider implements TTSProvider {
  readonly name = "elevenlabs" as const;

  async synthesize(args: SynthesizeArgs): Promise<SynthesizeResult> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ELEVENLABS_API_KEY is not set. Add it to your .env.local to use the ElevenLabs narration option."
      );
    }

    const voiceId = args.voiceId?.trim() || process.env.ELEVENLABS_DEFAULT_VOICE_ID?.trim() || "";
    if (!voiceId) {
      throw new Error(
        "ElevenLabs precisa de um voice_id explícito. O DNA HeyGen (Juan Carlos) não tem voice_id da API — " +
          "escolha uma voz masculina em «Voz para o áudio» ao aprovar o roteiro."
      );
    }
    const finalPath = path.join(args.outDir, `${args.fileBaseName}.mp3`);

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: args.text,
        model_id: "eleven_v3",
        voice_settings: {
          // Robust. 0.5 pushes a cinematic voice into a saturated read that
          // does not match the calm ElevenLabs preview of the same id.
          stability: 1,
          similarity_boost: 0.85,
          use_speaker_boost: false,
          speed: clampSpeed(args.speed),
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`ElevenLabs TTS request failed (${response.status}): ${body.slice(0, 500)}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(finalPath, Buffer.from(arrayBuffer));

    const durationSeconds = args.measureDuration === false ? 0 : await ffprobeDuration(finalPath);
    return { filePath: finalPath, durationSeconds, provider: this.name };
  }
}

function clampSpeed(speed: number): number {
  // ElevenLabs accepts roughly 0.7–1.2 for the `speed` voice setting.
  return Math.min(1.2, Math.max(0.7, speed));
}
