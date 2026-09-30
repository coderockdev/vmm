import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import { getAudiobookSettings, saveAudiobookSettings } from "../../../../../../core/repo/books";
import {
  DEFAULT_AUDIOBOOK_SETTINGS,
  type ChannelAudiobookSettings,
} from "../../../../../../core/types";

export const dynamic = "force-dynamic";

const CHIRP_VOICES = [
  "pt-BR-Chirp3-HD-Charon",
  "pt-BR-Chirp3-HD-Orus",
  "pt-BR-Chirp3-HD-Fenrir",
] as const;

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
  return NextResponse.json({
    settings,
    voices: CHIRP_VOICES.map((id) => ({
      id,
      label: id.replace("pt-BR-Chirp3-HD-", ""),
    })),
  });
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
    next.ttsVoice = body.ttsVoice.trim();
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

  const saved = await saveAudiobookSettings(channel.id, next);
  return NextResponse.json({ settings: saved });
}
