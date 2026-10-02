import { LocalTTSProvider } from "./LocalTTSProvider";
import { CartesiaTTSProvider } from "./CartesiaTTSProvider";
import { ElevenLabsTTSProvider } from "./ElevenLabsTTSProvider";
import { UploadedAudioProvider } from "./UploadedAudioProvider";
import { HeyGenTTSProvider } from "./HeyGenTTSProvider";
import { TTSProvider, TTSProviderName } from "./TTSProvider";

export * from "./TTSProvider";
export * from "./voiceCatalog";
export * from "./voiceCapabilities";
export * from "./compileForVoice";

/**
 * TTS_PROVIDER env var sets the channel-wide default (Cartesia — best
 * cost/quality tradeoff we found; see voiceCatalog.ts for the curated named
 * voices). A specific generation request can still override it (e.g. to A/B
 * "cartesia" vs "elevenlabs" for the same script) by passing `override`.
 */
export function getTTSProvider(override?: TTSProviderName | null): TTSProvider {
  const name = override ?? ((process.env.TTS_PROVIDER as TTSProviderName) || "cartesia");
  if ((name as string) === "google") {
    throw new Error("Chirp se sintetiza con synthesizeChirpMp3, no con getTTSProvider.");
  }

  switch (name) {
    case "local":
      return new LocalTTSProvider();
    case "cartesia":
      return new CartesiaTTSProvider();
    case "elevenlabs":
      return new ElevenLabsTTSProvider();
    case "heygen":
      return new HeyGenTTSProvider();
    case "uploaded":
      return new UploadedAudioProvider();
    default:
      console.warn(`[TTSProvider] Unknown provider "${name}", falling back to cartesia.`);
      return new CartesiaTTSProvider();
  }
}
