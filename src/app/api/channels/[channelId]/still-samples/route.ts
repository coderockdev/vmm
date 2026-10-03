import { NextRequest, NextResponse } from "next/server";
import { getChannel, updateChannelDna } from "../../../../../core/repo/channels";
import { getImageProvider } from "../../../../../core/providers/image";
import { channelComparePrompt } from "../../../../../core/providers/image/channelStillPrompt";
import {
  STILL_IMAGE_CHOICES,
  stillImageChoice,
  stillImageUsageLabel,
  type StillImageChoiceId,
} from "../../../../../core/providers/image/stillChoices";
import { workingFilePath, persistFile } from "../../../../../core/storage";
import { mediaUrl } from "../../../../../core/media";
import { insertUsageEvent } from "../../../../../core/repo/usage";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isChoiceId(value: string): value is StillImageChoiceId {
  return STILL_IMAGE_CHOICES.some((choice) => choice.id === value);
}

export async function GET(_req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  return NextResponse.json({
    prompt: channelComparePrompt(channel),
    stillImage: channel.dna.visual.stillImage ?? null,
    choices: STILL_IMAGE_CHOICES,
  });
}

export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const choiceId = typeof body.choiceId === "string" ? body.choiceId : "";
  if (!isChoiceId(choiceId)) {
    return NextResponse.json({ error: "Qualidade desconhecida." }, { status: 400 });
  }
  const choice = stillImageChoice(choiceId);
  const prompt = channelComparePrompt(channel);
  const fileName = `still-compare-${choice.id}.png`;
  const outPath = workingFilePath(channel.id, "thumbnails", fileName);

  try {
    await getImageProvider("openai").generate({
      prompt,
      outPath,
      quality: choice.quality,
      model: choice.model,
      size: "1536x1024",
    });
    const ref = await persistFile(outPath, channel.id, "thumbnails", fileName, "image/png");
    await insertUsageEvent({
      channelId: channel.id,
      stage: "thumbnail",
      snapshot: {
        provider: "openai",
        model: stillImageUsageLabel(choice),
        images: 1,
        raw: { task: "still-compare", choiceId: choice.id },
      },
    }).catch(() => undefined);
    const url = mediaUrl(channel.id, ref);
    return NextResponse.json({
      choiceId: choice.id,
      usd: choice.usd,
      url: url ? `${url}?t=${Date.now()}` : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const choiceId = typeof body.choiceId === "string" ? body.choiceId : "";
  if (!isChoiceId(choiceId)) {
    return NextResponse.json({ error: "Qualidade desconhecida." }, { status: 400 });
  }
  await updateChannelDna(channel.id, {
    ...channel.dna,
    visual: { ...channel.dna.visual, stillImage: choiceId },
  });
  return NextResponse.json({ stillImage: choiceId });
}
