import { NextRequest, NextResponse } from "next/server";
import { getChannel, updateChannelCoverRef, updateChannelDna } from "../../../../../core/repo/channels";
import { getImageProvider } from "../../../../../core/providers/image";
import { channelComparePrompt, channelCoverPrompt } from "../../../../../core/providers/image/channelStillPrompt";
import { normalizeCoverDna } from "../../../../../core/providers/image/coverFormats";
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
  const coverUrl = mediaUrl(channel.id, channel.coverRef);
  return NextResponse.json({
    prompt: channelComparePrompt(channel),
    coverPrompt: channelCoverPrompt(channel),
    coverUrl: coverUrl ? `${coverUrl}?t=${Date.now()}` : null,
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
  const kind = body.kind === "cover" ? "cover" : "still";
  const written = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const prompt =
    written ||
    (kind === "cover" ? channelCoverPrompt(channel) : channelComparePrompt(channel));
  const fileName =
    kind === "cover" ? (body.useOnChannel === true ? "cover.png" : "cover-sample.png") : `still-compare-${choice.id}.png`;
  const folder = kind === "cover" && body.useOnChannel === true ? "cover" : "thumbnails";
  const outPath = workingFilePath(channel.id, folder, fileName);

  try {
    await getImageProvider("openai").generate({
      prompt,
      outPath,
      quality: choice.quality,
      model: choice.model,
      size: "1536x1024",
    });
    const ref = await persistFile(outPath, channel.id, folder, fileName, "image/png");
    if (kind === "cover" && body.useOnChannel === true) {
      await updateChannelCoverRef(channel.id, ref);
      const cover = normalizeCoverDna(channel.dna.visual?.cover);
      await updateChannelDna(channel.id, {
        ...channel.dna,
        visual: { ...channel.dna.visual, cover: { ...cover, styleRules: prompt } },
      });
    }
    await insertUsageEvent({
      channelId: channel.id,
      stage: "thumbnail",
      snapshot: {
        provider: "openai",
        model: stillImageUsageLabel(choice),
        images: 1,
        raw: { task: kind === "cover" ? "cover-sample" : "still-compare", choiceId: choice.id },
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
  const coverPrompt = typeof body.coverPrompt === "string" ? body.coverPrompt.trim() : "";
  if (choiceId && !isChoiceId(choiceId)) {
    return NextResponse.json({ error: "Qualidade desconhecida." }, { status: 400 });
  }
  if (!choiceId && !coverPrompt) {
    return NextResponse.json({ error: "Nada para guardar." }, { status: 400 });
  }
  const cover = normalizeCoverDna(channel.dna.visual?.cover);
  await updateChannelDna(channel.id, {
    ...channel.dna,
    visual: {
      ...channel.dna.visual,
      ...(choiceId ? { stillImage: choiceId } : {}),
      ...(coverPrompt ? { cover: { ...cover, styleRules: coverPrompt } } : {}),
    },
  });
  return NextResponse.json({
    stillImage: choiceId || channel.dna.visual.stillImage || null,
    coverPrompt: coverPrompt || cover.styleRules,
  });
}
