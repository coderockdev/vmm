import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../core/repo/channels";
import { getContentPlan, getIdea } from "../../../../../core/repo/plans";
import { generateScriptsForIdeas } from "../../../../../core/pipeline/generate";

export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const body = await req.json();
  const plan = await getContentPlan(body.planId);
  if (!plan || plan.channelId !== channel.id) {
    return NextResponse.json({ error: "Content plan not found" }, { status: 404 });
  }

  const ideaIds: string[] = body.ideaIds ?? plan.items.filter((i) => i.status === "planned").map((i) => i.id);
  const ideaResults = await Promise.all(ideaIds.map((id) => getIdea(id)));
  const ideas = ideaResults.filter((i): i is NonNullable<typeof i> => Boolean(i) && i!.status === "planned");

  if (ideas.length === 0) {
    return NextResponse.json({ error: "No ideas selected" }, { status: 400 });
  }

  try {
    const projectIds = await generateScriptsForIdeas({
      channel,
      topic: plan.topic,
      durationMinutes: plan.durationMinutes,
      format: plan.format,
      ideas,
      aiProviderOverride: body.aiProviderOverride ?? null,
    });
    return NextResponse.json({ projectIds });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
