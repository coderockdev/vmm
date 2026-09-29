import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../core/repo/channels";
import { generateMancheteVariants } from "../../../../../core/pipeline/generateYoutubeCopy";
import { insertUsageEvent } from "../../../../../core/repo/usage";

export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const topic = String(body.topic ?? "").trim();
  if (!topic) {
    return NextResponse.json({ error: "Indica um tema ou título base para a manchete." }, { status: 400 });
  }
  const quantity = Math.min(10, Math.max(1, Number(body.quantity) || 5));
  const aiProviderOverride = body.aiProviderOverride ? String(body.aiProviderOverride) : null;

  try {
    const result = await generateMancheteVariants({
      channel,
      topic,
      quantity,
      aiProviderOverride,
    });

    if (result.usage) {
      await insertUsageEvent({
        channelId: channel.id,
        contentIdeaId: null,
        videoProjectId: null,
        stage: "ideas",
        snapshot: result.usage,
      }).catch(() => undefined);
    }

    return NextResponse.json({
      items: result.items,
      bankSize: (channel.dna.successfulTitles ?? []).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
