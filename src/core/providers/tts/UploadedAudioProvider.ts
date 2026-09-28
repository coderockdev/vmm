import { TTSProvider, SynthesizeArgs, SynthesizeResult } from "./TTSProvider";

/**
 * Not a real synthesizer — used when the user brings their own MP3/WAV
 * instead of generating narration. The narration pipeline detects an
 * uploaded file up front and skips per-line synthesis entirely, so this
 * class exists mainly to keep the TTSProviderName union meaningful and to
 * fail loudly if something calls it by mistake.
 */
export class UploadedAudioProvider implements TTSProvider {
  readonly name = "uploaded" as const;

  async synthesize(_args: SynthesizeArgs): Promise<SynthesizeResult> {
    throw new Error(
      "UploadedAudioProvider.synthesize() should never be called — uploaded audio is attached directly via attachUploadedAudio()."
    );
  }
}
