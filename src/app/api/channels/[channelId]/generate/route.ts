import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../core/repo/channels";
import { getContentPlan, getIdea } from "../../../../../core/repo/plans";
import { generateVideosForIdeas } from "../../../../../core/pipeline/generate";

export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const body = await req.json();
  const plan = getContentPlan(body.planId);
  if (!plan || plan.channelId !== channel.id) {
    return NextResponse.json({ error: "Content plan not found" }, { status: 404 });
  }

  const ideaIds: string[] = body.ideaIds ?? plan.items.filter((i) => i.status === "planned").map((i) => i.id);
  const ideas = ideaIds.map((id) => getIdea(id)).filter((i): i is NonNullable<typeof i> => Boolean(i) && i!.status === "planned");

  if (ideas.length === 0) {
    return NextResponse.json({ error: "No ideas selected" }, { status: 400 });
  }

  const projectIds = await generateVideosForIdeas({
    channel,
    topic: plan.topic,
    durationMinutes: plan.durationMinutes,
    format: plan.format,
    ideas,
    ttsProviderOverride: body.ttsProviderOverride ?? null,
  });

  return NextResponse.json({ projectIds });
}
