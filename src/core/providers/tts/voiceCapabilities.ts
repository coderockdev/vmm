import { Language } from "../../types";
import { TTSProviderName } from "./TTSProvider";

/** Canonical Amor Amor / ElevenLabs-v3 emotion + pause tags (script source format). */
export const AMOR_AMOR_ALLOWED_TAGS = [
  "[softly]",
  "[sighs]",
  "[whispers]",
  "[warmly]",
  "[excited]",
  "[sad]",
  "[thoughtfully]",
  "[exhales]",
  "[emotional]",
  "[pause]",
  "[tenderly]",
  "[hopeful]",
  "[laughs softly]",
] as const;

export type AmorAmorTag = (typeof AMOR_AMOR_ALLOWED_TAGS)[number];

export type VoiceProvider = "heygen" | "elevenlabs" | "cartesia" | "local" | "uploaded";

export interface VoiceCapabilities {
  emotion_tags: boolean;
  allowed_tags: string[];
  break_tags: boolean;
  /** Always false — accent comes from the voice, never from a tag. */
  accent_tag: boolean;
}

export interface VoiceProfile {
  provider: VoiceProvider;
  voice_id: string | null;
  voice_name: string;
  model?: string;
  language: string;
  locale?: string;
  speed: number;
  stability?: number;
  heygen_template_id?: string;
  capabilities: VoiceCapabilities;
  validated_for_channel?: boolean;
  notes?: string;
}

export const JUAN_CARLOS_HEYGEN: VoiceProfile = {
  provider: "heygen",
  voice_id: null,
  voice_name: "Juan Carlos",
  model: "elevenlabs_v3",
  language: "es",
  speed: 0.9,
  stability: 0.5,
  heygen_template_id: "c12ae661d2b6442bb079871a697ea4ef",
  capabilities: {
    emotion_tags: true,
    allowed_tags: [...AMOR_AMOR_ALLOWED_TAGS],
    break_tags: true,
    accent_tag: false,
  },
  validated_for_channel: true,
  notes:
    "Voz, motor, modelo e velocidade 0.9 já salvos no template do HeyGen. Envio via generate_from_template com texto_oracion_1..4, SEM voice_id.",
};

const EMPTY_CAPS: VoiceCapabilities = {
  emotion_tags: false,
  allowed_tags: [],
  break_tags: false,
  accent_tag: false,
};

export function capabilitiesForProvider(provider: VoiceProvider): VoiceCapabilities {
  switch (provider) {
    case "heygen":
    case "elevenlabs":
      return {
        emotion_tags: true,
        allowed_tags: [...AMOR_AMOR_ALLOWED_TAGS],
        break_tags: provider === "heygen", // Eleven v3: false (breaks converted at compile)
        accent_tag: false,
      };
    case "cartesia":
      return {
        emotion_tags: true,
        allowed_tags: [...AMOR_AMOR_ALLOWED_TAGS],
        break_tags: true,
        accent_tag: false,
      };
    case "local":
    case "uploaded":
    default:
      return { ...EMPTY_CAPS };
  }
}

/** Build a VoiceProfile from the legacy catalog / DNA voice fields. */
export function profileFromLegacyVoice(args: {
  provider: TTSProviderName | VoiceProvider;
  voiceId: string | null;
  voiceName?: string;
  speed: number;
  language: Language;
  volume?: number;
}): VoiceProfile {
  const provider = (args.provider === "uploaded" ? "uploaded" : args.provider) as VoiceProvider;
  const caps = capabilitiesForProvider(provider);
  return {
    provider,
    voice_id: args.voiceId,
    voice_name: args.voiceName ?? args.voiceId ?? provider,
    model: provider === "elevenlabs" ? "eleven_v3" : provider === "cartesia" ? "sonic-3" : undefined,
    language: args.language,
    speed: args.speed,
    stability: provider === "elevenlabs" || provider === "heygen" ? 0.5 : undefined,
    capabilities: caps,
    validated_for_channel: false,
  };
}

export function toLegacyVoiceFields(profile: VoiceProfile): {
  provider: TTSProviderName;
  voiceId: string | null;
  speed: number;
  volume: number;
} {
  const provider: TTSProviderName =
    profile.provider === "heygen"
      ? "elevenlabs" // pipeline narrates via eleven when testing; heygen is template-video path
      : profile.provider === "uploaded"
        ? "uploaded"
        : (profile.provider as TTSProviderName);
  return {
    provider: profile.provider === "heygen" ? ("heygen" as TTSProviderName) : provider,
    voiceId: profile.voice_id,
    speed: profile.speed,
    volume: 1,
  };
}
