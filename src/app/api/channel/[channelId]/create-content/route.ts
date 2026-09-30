import { NextRequest, NextResponse } from "next/server";
import type { VideoFormat } from "../../../../../core/types";
import { getChannel } from "../../../../../core/repo/channels";
import { isSupabaseEnabled } from "../../../../../core/supabaseClient";
import { CHANNEL_VIEW_PROVIDERS, ChannelViewProvider } from "../../../../../core/channelView/llm";
import { generateChannelViewIdeas } from "../../../../../core/channelView/ideas";

const FORMATS = new Set<VideoFormat>(["video", "short", "both"]);

/** "Gerar assuntos" for the /channel/[slug] screen. Independent of /api/channels/*. */
export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  if (!isSupabaseEnabled()) {
    return NextResponse.json(
      { error: "A criação de conteúdo exige DB_PROVIDER=supabase; nenhum dado foi salvo localmente." },
      { status: 503 }
    );
  }

  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  if (topic.length > 500) {
    return NextResponse.json({ error: "Topic must be 500 characters or fewer" }, { status: 400 });
  }

  const quantity = Number(body.quantity ?? 10);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    return NextResponse.json({ error: "Quantity must be between 1 and 10" }, { status: 400 });
  }

  const durationMinutes = body.durationMinutes == null
    ? channel.dna.scriptRules.defaultDurationMinutes
    : Number(body.durationMinutes);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 180) {
    return NextResponse.json({ error: "Duration must be between 1 and 180 minutes" }, { status: 400 });
  }

  const format = body.format == null ? "video" : body.format;
  if (typeof format !== "string" || !FORMATS.has(format as VideoFormat)) {
    return NextResponse.json({ error: "Unsupported content format" }, { status: 400 });
  }

  const requested = body.aiProviderOverride == null || body.aiProviderOverride === ""
    ? (process.env.AI_PROVIDER ?? "")
    : String(body.aiProviderOverride);
  const provider = requested.toLowerCase();
  if (!CHANNEL_VIEW_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: "Selecione uma IA (Claude, ChatGPT ou Gemini) para gerar os assuntos." }, { status: 400 });
  }

  const useSuccessfulTitles = body.useSuccessfulTitles !== false;
  try {
    const result = await generateChannelViewIdeas({
      channel,
      topic,
      quantity,
      durationMinutes,
      format: format as VideoFormat,
      provider: provider as ChannelViewProvider,
      useSuccessfulTitles,
      rewriteHeadlines: body.includeManchete !== false && useSuccessfulTitles,
    });
    return NextResponse.json({
      plan: result.plan,
      resolvedTopic: result.resolvedTopic,
      fromDna: !topic,
      includeManchete: result.headlinesApplied,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
