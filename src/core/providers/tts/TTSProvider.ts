export type TTSProviderName = "local" | "cartesia" | "elevenlabs" | "uploaded" | "heygen";

export interface SynthesizeArgs {
  text: string;
  language: "es" | "pt" | "en";
  voiceId: string | null;
  speed: number;
  outDir: string;
  fileBaseName: string;
  /**
   * Voice preview only needs the audio bytes. Skip ffprobe so the sample
   * still plays on hosts that do not ship ffmpeg (Vercel, a bare PATH).
   */
  measureDuration?: boolean;
}

export interface SynthesizeResult {
  filePath: string; // absolute path to the produced audio file
  durationSeconds: number;
  provider: TTSProviderName;
}

/**
 * TTSProvider is the single seam between VMM and any narration backend.
 * Today: LocalTTSProvider (macOS `say`) and ElevenLabsTTSProvider (real API).
 * UploadedAudioProvider covers the "bring your own MP3/WAV" fallback.
 */
export interface TTSProvider {
  readonly name: TTSProviderName;
  synthesize(args: SynthesizeArgs): Promise<SynthesizeResult>;
}
