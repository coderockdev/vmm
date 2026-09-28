import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../core/repo/channels";
import { generateContentPlanForChannel } from "../../../../../core/pipeline/generate";

export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const body = await req.json();
  const quantity = Math.max(1, Math.min(10, Number(body.quantity) || 1));
  const durationMinutes = Number(body.durationMinutes) || channel.dna.scriptRules.defaultDurationMinutes;
  const format = body.format ?? "video";

  const plan = await generateContentPlanForChannel({
    channel,
    topic: String(body.topic ?? "").trim(),
    quantity,
    durationMinutes,
    format,
  });

  return NextResponse.json({ plan });
}
