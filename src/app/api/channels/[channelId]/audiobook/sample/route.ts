import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import { getAudiobookSettings } from "../../../../../../core/repo/books";
import { auditionSampleText, synthesizeAudition } from "../../../../../../core/audiobook/auditionSample";
import { chirpBilledCharacters } from "../../../../../../core/providers/tts/chirpSpeech";
import { recordChirpUsage } from "../../../../../../core/repo/usage";
import {
  findAuditionVoice,
  isCartesiaVoiceId,
  type AuditionProvider,
} from "../../../../../../core/audiobook/auditionVoices";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROVIDERS = new Set<AuditionProvider>([
  "edge",
  "cartesia",
  "elevenlabs",
  "openai",
  "gemini",
  "google",
]);

/** One voice, one short clip. The old route synthesized every voice in a single request and 504'd. */
export async function POST(
  req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  if (channel.dna.mode !== "audiobook") {
    return NextResponse.json({ error: "Canal não é audiolivro" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const provider = String(body.provider ?? "") as AuditionProvider;
  const voiceId = String(body.voiceId ?? "");
  if (!PROVIDERS.has(provider) || !voiceId) {
    return NextResponse.json({ error: "Diz o provedor e a voz." }, { status: 400 });
  }
  const voice = findAuditionVoice(provider, voiceId);
  const dynamicCartesia = provider === "cartesia" && isCartesiaVoiceId(voiceId);
  if (!voice && !dynamicCartesia) {
    return NextResponse.json({ error: "Voz desconhecida." }, { status: 400 });
  }

  try {
    const settings = await getAudiobookSettings(channel.id);
    const speed = typeof body.speed === "number" && body.speed > 0 ? body.speed : settings.ttsSpeakingRate;
    const buf = await synthesizeAudition(provider, voiceId, channel.dna.language, speed);
    if (provider === "google") {
      await recordChirpUsage({
        channelId: channel.id,
        characters: chirpBilledCharacters(auditionSampleText(channel.dna.language)),
      }).catch(() => undefined);
    }
    const mime = provider === "gemini" ? "audio/wav" : "audio/mpeg";
    return NextResponse.json({
      provider,
      voiceId,
      name: voice?.name ?? String(body.name ?? voiceId),
      mime,
      audio: `data:${mime};base64,${buf.toString("base64")}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
