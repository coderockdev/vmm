import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../core/repo/channels";
import { runAutoFlow } from "../../../../../core/pipeline/autoFlow";
import { VideoFormat } from "../../../../../core/types";

export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const topic = String(body.topic ?? "").trim();
  if (!topic) return NextResponse.json({ error: "Topic is required" }, { status: 400 });

  const quantity = Math.max(1, Math.min(10, Number(body.quantity) || 1));
  const durationMinutes =
    Number(body.durationMinutes) || channel.dna.scriptRules.defaultDurationMinutes;
  const format = (body.format ?? "video") as VideoFormat;
  const sceneCount =
    body.sceneCount != null ? Number(body.sceneCount) : channel.dna.scriptRules.defaultSceneCount ?? 4;

  try {
    const result = await runAutoFlow({
      channel,
      topic,
      quantity,
      durationMinutes,
      format,
      sceneCount,
      aiProviderOverride: body.aiProviderOverride ?? null,
    });
    return NextResponse.json({
      ok: true,
      planId: result.planId,
      projectIds: result.projectIds,
      message: `${result.projectIds.length} vídeo(s) na fila: áudio → música/SFX → vídeo → portada`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
