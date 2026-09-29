import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../core/repo/channels";
import { generateContentPlanForChannel } from "../../../../../core/pipeline/generate";
import { resolveAutoTopic } from "../../../../../core/pipeline/autoFlow";
import { generateMancheteVariants } from "../../../../../core/pipeline/generateYoutubeCopy";

export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const body = await req.json();
  const quantity = Math.max(1, Math.min(10, Number(body.quantity) || 1));
  const durationMinutes = Number(body.durationMinutes) || channel.dna.scriptRules.defaultDurationMinutes;
  const format = body.format ?? "video";
  const includeManchete = body.includeManchete !== false;
  const topic = resolveAutoTopic(channel, String(body.topic ?? ""));

  try {
    const plan = await generateContentPlanForChannel({
      channel,
      topic,
      quantity,
      durationMinutes,
      format,
      aiProviderOverride: body.aiProviderOverride ?? null,
    });

    // Optional: rewrite idea titles with DNA-pattern manchetes, then continue to Ideias.
    if (includeManchete && plan.items.length > 0) {
      try {
        const { items } = await generateMancheteVariants({
          channel,
          topic,
          quantity: plan.items.length,
          aiProviderOverride: body.aiProviderOverride ?? null,
        });
        for (let i = 0; i < plan.items.length; i++) {
          const copy = items[i];
          if (!copy?.headline) continue;
          plan.items[i] = {
            ...plan.items[i],
            title: copy.headline.slice(0, 100),
            angle: plan.items[i].angle || copy.youtubeDescription.slice(0, 180),
          };
        }
      } catch (err) {
        console.warn(
          "[content-plan] manchete enhance skipped:",
          err instanceof Error ? err.message : err
        );
      }
    }

    return NextResponse.json({
      plan,
      resolvedTopic: topic,
      fromDna: !String(body.topic ?? "").trim(),
      includeManchete,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
