import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../core/repo/channels";
import { getContentPlan, getIdea } from "../../../../../core/repo/plans";
import { CHANNEL_VIEW_PROVIDERS, ChannelViewProvider } from "../../../../../core/channelView/llm";
import { generateChannelViewScripts } from "../../../../../core/channelView/scripts";

// Multi-scene generation can take several minutes per idea.
export const maxDuration = 300;

/** "Gerar roteiros selecionados" for the /channel/[slug] screen. Independent of /api/channels/*. */
export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const plan = typeof body.planId === "string" ? await getContentPlan(body.planId) : null;
  if (!plan || plan.channelId !== channel.id) {
    return NextResponse.json({ error: "Content plan not found" }, { status: 404 });
  }

  const provider = String(body.aiProviderOverride ?? "").toLowerCase();
  if (!CHANNEL_VIEW_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: "Selecione uma IA (Claude, ChatGPT ou Gemini) para gerar os roteiros." }, { status: 400 });
  }

  const sceneCount = Number(body.sceneCount);
  if (!Number.isInteger(sceneCount) || sceneCount < 3 || sceneCount > 8) {
    return NextResponse.json({ error: "A quantidade de cenas deve ficar entre 3 e 8." }, { status: 400 });
  }
  const targetWords = Number(body.targetWords);
  if (!Number.isInteger(targetWords) || targetWords < 100 || targetWords > 6000) {
    return NextResponse.json({ error: "A meta deve ficar entre 100 e 6.000 palavras." }, { status: 400 });
  }

  const ideaIds = Array.isArray(body.ideaIds) ? body.ideaIds.map(String) : [];
  const found = await Promise.all(ideaIds.map((id) => getIdea(id)));
  const ideas = found.filter((idea): idea is NonNullable<typeof idea> => Boolean(idea) && idea!.planId === plan.id && idea!.status === "planned");
  if (ideas.length === 0) return NextResponse.json({ error: "No ideas selected" }, { status: 400 });

  try {
    const projectIds = await generateChannelViewScripts({
      channel,
      topic: plan.topic,
      durationMinutes: plan.durationMinutes,
      format: plan.format,
      ideas,
      provider: provider as ChannelViewProvider,
      sceneCount,
      targetWords,
    });
    return NextResponse.json({ projectIds });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
