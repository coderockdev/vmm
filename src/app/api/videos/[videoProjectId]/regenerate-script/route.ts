import { NextRequest, NextResponse } from "next/server";
import { regenerateScript } from "../../../../../core/pipeline/produce";
import { getVideoProject } from "../../../../../core/repo/projects";

export async function POST(req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const body = await req.json().catch(() => ({}));

  try {
    const script = await regenerateScript(params.videoProjectId, body.aiProviderOverride ?? null);
    const project = await getVideoProject(params.videoProjectId);
    return NextResponse.json({ script, project });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
