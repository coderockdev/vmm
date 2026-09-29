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
  /** HeyGen template path: leave null (voice is baked in the template). */
  voice_id: string | null;
  /**
   * ElevenLabs voice id for the same talent (Juan Carlos). Used for pipeline
   * audio / previews — HeyGen video still goes through the template without
   * sending this id.
   */
  elevenlabs_voice_id?: string | null;
  voice_name: string;
  model?: string;
  language: string;
  locale?: string;
  /** Accent label for UI (comes from the voice itself, never from a tag). */
  accent?: string;
  speed: number;
  stability?: number;
  heygen_template_id?: string;
  capabilities: VoiceCapabilities;
  validated_for_channel?: boolean;
  notes?: string;
}

/** ElevenLabs shared voice: Juan Carlos — Warm, Calm and Deep (LATAM, masculine). */
export const JUAN_CARLOS_ELEVENLABS_VOICE_ID = "RyfjEHnKbtma4Srae2za";

export const JUAN_CARLOS_HEYGEN: VoiceProfile = {
  provider: "heygen",
  voice_id: null,
  elevenlabs_voice_id: JUAN_CARLOS_ELEVENLABS_VOICE_ID,
  voice_name: "Juan Carlos",
  model: "elevenlabs_v3",
  language: "es",
  accent: "latin american",
  speed: 0.85,
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
    "Mesma voz ElevenLabs v3 (Juan Carlos — Warm, Calm and Deep) que o template HeyGen usa. " +
    "Vídeo: generate_from_template texto_oracion_1..4 SEM voice_id. " +
    "Áudio do pipeline: ElevenLabs eleven_v3 + elevenlabs_voice_id, speed 0.85, stability 0.5.",
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
      ? "heygen"
      : profile.provider === "uploaded"
        ? "uploaded"
        : (profile.provider as TTSProviderName);
  return {
    provider,
    // Prefer ElevenLabs id for heygen DNA so audio/TTS paths have a real voice.
    voiceId:
      profile.provider === "heygen"
        ? profile.elevenlabs_voice_id ?? profile.voice_id
        : profile.voice_id,
    speed: profile.speed,
    volume: 1,
  };
}

/** Resolve provider + voice for local audio pipeline (not HeyGen video). */
export function resolvePipelineAudioVoice(args: {
  channelProvider: TTSProviderName | VoiceProvider;
  channelVoiceId: string | null;
  profile?: VoiceProfile | null;
  /** DNA / UI speed — preferred over profile default when set. */
  channelSpeed?: number | null;
  ttsOverride?: TTSProviderName | null;
  ttsVoiceIdOverride?: string | null;
}): { provider: TTSProviderName; voiceId: string | null; speed: number; stability: number | null } {
  const profile = args.profile ?? null;
  const override = args.ttsOverride && args.ttsOverride !== args.channelProvider ? args.ttsOverride : null;

  let provider: TTSProviderName;
  let voiceId: string | null;
  const channelSpeed =
    typeof args.channelSpeed === "number" && Number.isFinite(args.channelSpeed) && args.channelSpeed > 0
      ? args.channelSpeed
      : null;
  // Prefer DNA voice.speed (0.85 Amor Amor) over stale profile defaults (was 0.9).
  let speed = channelSpeed ?? profile?.speed ?? 0.85;
  let stability: number | null = profile?.stability ?? 0.5;

  if (override) {
    provider = override;
    voiceId = args.ttsVoiceIdOverride?.trim() || null;
  } else if (args.channelProvider === "heygen" || profile?.provider === "heygen") {
    // DNA HeyGen Juan Carlos → same ElevenLabs voice for pipeline audio.
    provider = "elevenlabs";
    voiceId =
      args.ttsVoiceIdOverride?.trim() ||
      profile?.elevenlabs_voice_id ||
      JUAN_CARLOS_ELEVENLABS_VOICE_ID;
  } else {
    provider = args.channelProvider as TTSProviderName;
    voiceId =
      args.ttsVoiceIdOverride?.trim() || args.channelVoiceId || profile?.voice_id || null;
    stability = profile?.stability ?? null;
  }

  // Hard guarantee: never call ElevenLabs without a voice id.
  if (provider === "elevenlabs" && !voiceId?.trim()) {
    voiceId =
      profile?.elevenlabs_voice_id ||
      profile?.voice_id ||
      args.channelVoiceId ||
      JUAN_CARLOS_ELEVENLABS_VOICE_ID;
  }

  return { provider, voiceId, speed, stability };
}
