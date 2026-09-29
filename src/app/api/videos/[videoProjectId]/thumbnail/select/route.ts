import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import { getVideoProject, updateProjectThumbnail } from "../../../../../../core/repo/projects";
import { mediaUrl } from "../../../../../../core/media";
import { mergeThumbnailHistory } from "../../../../../../core/providers/image/thumbnailStyles";

/** Mark one candidate (current batch or history) as the primary thumbnail. */
export async function POST(req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const project = await getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const channel = await getChannel(project.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const concept = project.thumbnailConcept;
  if (!concept) {
    return NextResponse.json({ error: "Nenhuma portada gerada ainda." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const pool = mergeThumbnailHistory(concept.history, concept.candidates ?? []);
  if (pool.length === 0) {
    return NextResponse.json({ error: "Nenhuma variação gerada ainda." }, { status: 400 });
  }

  let chosen: (typeof pool)[number] | undefined =
    typeof body.index === "number"
      ? pool[body.index]
      : pool.find((c) => c.id === body.candidateId || c.ref === body.ref);

  if (!chosen && project.thumbnailRef) {
    chosen = pool.find((c) => c.ref === project.thumbnailRef);
  }
  if (!chosen) {
    return NextResponse.json({ error: "Variação inválida." }, { status: 400 });
  }

  // Keep chosen in the active candidates batch (first slot) so UI stays in sync.
  const others = (concept.candidates ?? []).filter((c) => c.id !== chosen.id);
  const candidates = [chosen, ...others].slice(0, 3);
  const history = mergeThumbnailHistory(concept.history, [chosen]);

  const next = {
    ...concept,
    candidates,
    selectedCandidateIndex: 0,
    history,
    updatedAt: new Date().toISOString(),
  };
  await updateProjectThumbnail(project.id, next, chosen.ref);

  return NextResponse.json({
    concept: next,
    thumbnailUrl: `${mediaUrl(channel.id, chosen.ref)}?t=${Date.now()}`,
    project: await getVideoProject(project.id),
  });
}
