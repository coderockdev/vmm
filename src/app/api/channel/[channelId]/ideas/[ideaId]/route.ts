import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import { getContentPlan, getIdea, setIdeaStatus } from "../../../../../../core/repo/plans";
import { updateChannelViewIdea } from "../../../../../../core/channelView/ideaRepo";

async function ownedIdea(channelId: string, ideaId: string) {
  const channel = await getChannel(channelId);
  if (!channel) return null;
  const idea = await getIdea(ideaId);
  if (!idea) return null;
  const plan = await getContentPlan(idea.planId);
  return plan && plan.channelId === channel.id ? idea : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { channelId: string; ideaId: string } }) {
  if (!(await ownedIdea(params.channelId, params.ideaId))) {
    return NextResponse.json({ error: "Assunto não encontrado neste canal." }, { status: 404 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const fields = { title: text(body.title), angle: text(body.angle), objective: text(body.objective) };
  if (!fields.title) return NextResponse.json({ error: "O assunto precisa ter um título." }, { status: 400 });
  await updateChannelViewIdea(params.ideaId, fields);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { channelId: string; ideaId: string } }) {
  if (!(await ownedIdea(params.channelId, params.ideaId))) {
    return NextResponse.json({ error: "Assunto não encontrado neste canal." }, { status: 404 });
  }
  await setIdeaStatus(params.ideaId, "removed");
  return NextResponse.json({ ok: true });
}
