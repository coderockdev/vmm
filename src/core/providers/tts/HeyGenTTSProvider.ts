import { TTSProvider, SynthesizeArgs, SynthesizeResult } from "./TTSProvider";

/**
 * HeyGen is used via generate_from_template for video (voice baked in the
 * template). Direct TTS synthesize is not supported — use preview_audio from
 * the HeyGen voices API for free previews instead.
 */
export class HeyGenTTSProvider implements TTSProvider {
  readonly name = "heygen" as const;

  async synthesize(_args: SynthesizeArgs): Promise<SynthesizeResult> {
    throw new Error(
      "HeyGen não sintetiza áudio direto neste fluxo. A voz está no template (generate_from_template). Use a prévia gratuita do card ou o editor HeyGen."
    );
  }
}
