import { TTSProvider, TTSProviderName } from "./TTSProvider";
import { LocalTTSProvider } from "./LocalTTSProvider";
import { CartesiaTTSProvider } from "./CartesiaTTSProvider";
import { ElevenLabsTTSProvider } from "./ElevenLabsTTSProvider";
import { UploadedAudioProvider } from "./UploadedAudioProvider";

export * from "./TTSProvider";
export * from "./voiceCatalog";

/**
 * TTS_PROVIDER env var sets the channel-wide default (Cartesia — best
 * cost/quality tradeoff we found; see voiceCatalog.ts for the curated named
 * voices). A specific generation request can still override it (e.g. to A/B
 * "cartesia" vs "elevenlabs" for the same script) by passing `override`.
 */
export function getTTSProvider(override?: TTSProviderName | null): TTSProvider {
  const name = override ?? ((process.env.TTS_PROVIDER as TTSProviderName) || "cartesia");

  switch (name) {
    case "local":
      return new LocalTTSProvider();
    case "cartesia":
      return new CartesiaTTSProvider();
    case "elevenlabs":
      return new ElevenLabsTTSProvider();
    case "uploaded":
      return new UploadedAudioProvider();
    default:
      console.warn(`[TTSProvider] Unknown provider "${name}", falling back to cartesia.`);
      return new CartesiaTTSProvider();
  }
}
