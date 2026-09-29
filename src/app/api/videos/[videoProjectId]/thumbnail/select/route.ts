import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import { getVideoProject, updateProjectThumbnail } from "../../../../../../core/repo/projects";
import { mediaUrl } from "../../../../../../core/media";

/** Mark one of the generated candidates as the primary thumbnail. */
export async function POST(req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const project = await getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const channel = await getChannel(project.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const concept = project.thumbnailConcept;
  const candidates = concept?.candidates ?? [];
  if (!concept || candidates.length === 0) {
    return NextResponse.json({ error: "Nenhuma variação gerada ainda." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  let index =
    typeof body.index === "number"
      ? body.index
      : candidates.findIndex((c) => c.id === body.candidateId || c.ref === body.ref);
  if (index < 0 || index >= candidates.length) {
    return NextResponse.json({ error: "Variação inválida." }, { status: 400 });
  }

  const chosen = candidates[index];
  const next = {
    ...concept,
    selectedCandidateIndex: index,
    updatedAt: new Date().toISOString(),
  };
  await updateProjectThumbnail(project.id, next, chosen.ref);

  return NextResponse.json({
    concept: next,
    thumbnailUrl: `${mediaUrl(channel.id, chosen.ref)}?t=${Date.now()}`,
    project: await getVideoProject(project.id),
  });
}
