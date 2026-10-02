import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import {
  getImageToVideoProvider,
  listImageToVideoProviders,
} from "../../../../../../core/audiobook/imageToVideo/provider";

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
  return NextResponse.json({ providers: listImageToVideoProviders() });
}

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
  const provider = getImageToVideoProvider(String(body.provider ?? ""));
  if (!provider) return NextResponse.json({ error: "Provedor desconhecido." }, { status: 400 });
  const prompt = String(body.prompt ?? "").trim();
  const imageRef = String(body.imageRef ?? "").trim();
  const durationSec = Number(body.durationSec);
  if (!prompt || !imageRef) {
    return NextResponse.json({ error: "Falta a imagem ou o prompt." }, { status: 400 });
  }
  if (!Number.isFinite(durationSec) || durationSec < 2 || durationSec > 10) {
    return NextResponse.json({ error: "A duração do clipe fica entre 2 e 10 segundos." }, { status: 400 });
  }

  const result = await provider.generateImageToVideo({
    imageRef,
    prompt,
    durationSec,
    model: String(body.model ?? provider.models[0] ?? ""),
  });
  return NextResponse.json({ result });
}
