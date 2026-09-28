import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../core/repo/channels";
import { generateContentPlanForChannel } from "../../../../../core/pipeline/generate";

export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const body = await req.json();
  const quantity = Math.max(1, Math.min(10, Number(body.quantity) || 1));
  const durationMinutes = Number(body.durationMinutes) || channel.dna.scriptRules.defaultDurationMinutes;
  const format = body.format ?? "video";

  try {
    const plan = await generateContentPlanForChannel({
      channel,
      topic: String(body.topic ?? "").trim(),
      quantity,
      durationMinutes,
      format,
      aiProviderOverride: body.aiProviderOverride ?? null,
    });
    return NextResponse.json({ plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
