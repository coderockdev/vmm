import type { Channel, ChannelAudiobookSettings, ChannelDNA } from "../types";
import { chirpVoiceProfile, profileFromLegacyVoice } from "../providers/tts/voiceCapabilities";
import { getAudiobookSettings, saveAudiobookSettings } from "../repo/books";
import { updateChannelDna } from "../repo/channels";
import { isChirpVoiceId } from "./chirpVoices";

/** Voice block to store on the channel DNA for the audiobook voice in use. */
export function dnaVoiceFromAudiobook(
  channel: Channel,
  settings: ChannelAudiobookSettings
): ChannelDNA["voice"] | null {
  const speed = settings.ttsSpeakingRate;
  const volume = channel.dna.voice.volume ?? 1;
  if (settings.ttsProvider === "google-chirp3-hd" && isChirpVoiceId(settings.ttsVoice)) {
    return {
      provider: "google",
      voiceId: settings.ttsVoice,
      speed,
      volume,
      profile: chirpVoiceProfile(settings.ttsVoice, speed, channel.dna.language),
    };
  }
  if (settings.ttsProvider === "cartesia" || settings.ttsProvider === "elevenlabs") {
    return {
      provider: settings.ttsProvider,
      voiceId: settings.ttsVoice,
      speed,
      volume,
      profile: profileFromLegacyVoice({
        provider: settings.ttsProvider,
        voiceId: settings.ttsVoice,
        speed,
        language: channel.dna.language,
      }),
    };
  }
  if (settings.ttsProvider === "edge-neural") {
    return {
      provider: "local",
      voiceId: settings.ttsVoice,
      speed,
      volume,
      profile: profileFromLegacyVoice({
        provider: "local",
        voiceId: settings.ttsVoice,
        speed,
        language: channel.dna.language,
      }),
    };
  }
  return null;
}

export async function mirrorAudiobookVoiceToDna(
  channel: Channel,
  settings: ChannelAudiobookSettings
): Promise<void> {
  const voice = dnaVoiceFromAudiobook(channel, settings);
  if (!voice) return;
  await updateChannelDna(channel.id, { ...channel.dna, voice });
}

/** Saving the DNA voice also becomes the voice the chapter narrator uses. */
export async function mirrorDnaVoiceToAudiobook(
  channelId: string,
  voice: ChannelDNA["voice"]
): Promise<void> {
  const current = await getAudiobookSettings(channelId);
  const speed = voice.speed > 0 ? voice.speed : current.ttsSpeakingRate;
  if (voice.provider === "google" && voice.voiceId && isChirpVoiceId(voice.voiceId)) {
    await saveAudiobookSettings(channelId, {
      ...current,
      ttsProvider: "google-chirp3-hd",
      ttsVoice: voice.voiceId,
      ttsLanguageCode: voice.voiceId.startsWith("es-US") ? "es-US" : "pt-BR",
      ttsSpeakingRate: speed,
    });
    return;
  }
  if ((voice.provider === "cartesia" || voice.provider === "elevenlabs") && voice.voiceId) {
    await saveAudiobookSettings(channelId, {
      ...current,
      ttsProvider: voice.provider,
      ttsVoice: voice.voiceId,
      ttsSpeakingRate: speed,
    });
  }
}
