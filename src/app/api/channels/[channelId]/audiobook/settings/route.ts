import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import { getAudiobookSettings, saveAudiobookSettings } from "../../../../../../core/repo/books";
import {
  DEFAULT_AUDIOBOOK_SETTINGS,
  type AudiobookTtsProvider,
  type ChannelAudiobookSettings,
} from "../../../../../../core/types";
import { normalizeVisualBudget } from "../../../../../../core/audiobook/visualBudget";
import {
  AUDITION_PROVIDERS,
  AUDITION_VOICES,
  findAuditionVoice,
  isCartesiaVoiceId,
} from "../../../../../../core/audiobook/auditionVoices";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { channelId: string } }
) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  if (channel.dna.mode !== "audiobook") {
    return NextResponse.json({ error: "Canal não é audiolivro" }, { status: 400 });
  }

  const settings = await getAudiobookSettings(channel.id);
  const chirpLocale = channel.dna.language === "es" ? "es-US-" : "pt-BR-";
  return NextResponse.json({
    settings,
    language: channel.dna.language,
    providers: AUDITION_PROVIDERS,
    voices: AUDITION_VOICES.filter((voice) => voice.provider !== "google" || voice.id.startsWith(chirpLocale)),
  });
}

function storedProvider(raw: string, voiceId: string): AudiobookTtsProvider | null {
  if (raw === "edge" || raw === "edge-neural") return "edge-neural";
  if (raw === "google" || raw === "google-chirp3-hd") return "google-chirp3-hd";
  if (raw === "cartesia" || raw === "elevenlabs" || raw === "openai" || raw === "gemini") return raw;
  const found = AUDITION_VOICES.find((v) => v.id === voiceId);
  if (!found) return null;
  if (found.provider === "edge") return "edge-neural";
  if (found.provider === "google") return "google-chirp3-hd";
  return found.provider;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  if (channel.dna.mode !== "audiobook") {
    return NextResponse.json({ error: "Canal não é audiolivro" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const current = await getAudiobookSettings(channel.id);
  const next: ChannelAudiobookSettings = {
    ...DEFAULT_AUDIOBOOK_SETTINGS,
    ...current,
  };

  if (typeof body.ttsVoice === "string" && body.ttsVoice.trim()) {
    const voiceId = body.ttsVoice.trim();
    const known = findAuditionVoice(String(body.ttsProvider ?? ""), voiceId) ??
      AUDITION_VOICES.find((v) => v.id === voiceId);
    const dynamicCartesia = String(body.ttsProvider ?? "") === "cartesia" && isCartesiaVoiceId(voiceId);
    if (!known && !dynamicCartesia) {
      return NextResponse.json({ error: "Voz desconhecida." }, { status: 400 });
    }
    const provider = dynamicCartesia
      ? "cartesia"
      : storedProvider(String(body.ttsProvider ?? known?.provider ?? ""), voiceId);
    if (!provider) {
      return NextResponse.json({ error: "Provedor desconhecido." }, { status: 400 });
    }
    next.ttsVoice = voiceId;
    next.ttsProvider = provider;
    if (provider === "cartesia") {
      next.ttsLanguageCode =
        channel.dna.language === "es" ? "es" : channel.dna.language === "en" ? "en" : "pt-BR";
    }
    if (provider === "google-chirp3-hd") {
      const locale = voiceId.match(/^(pt-BR|es-US)/)?.[1];
      if (locale) next.ttsLanguageCode = locale;
    }
  }
  if (typeof body.ttsSpeakingRate === "number" && body.ttsSpeakingRate > 0) {
    next.ttsSpeakingRate = body.ttsSpeakingRate;
  }
  if (typeof body.publishTimeLocal === "string" && body.publishTimeLocal.trim()) {
    next.publishTimeLocal = body.publishTimeLocal.trim();
  }
  if (typeof body.publishEveryDays === "number" && body.publishEveryDays >= 1) {
    next.publishEveryDays = Math.floor(body.publishEveryDays);
  }
  if (typeof body.maxUploadsPerDay === "number" && body.maxUploadsPerDay >= 1) {
    next.maxUploadsPerDay = Math.floor(body.maxUploadsPerDay);
  }
  if (body.visualBudget && typeof body.visualBudget === "object") {
    next.visualBudget = normalizeVisualBudget({ ...current.visualBudget, ...body.visualBudget });
  }

  const saved = await saveAudiobookSettings(channel.id, next);
  return NextResponse.json({ settings: saved });
}
