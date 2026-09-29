import { NextRequest, NextResponse } from "next/server";
import { approveScriptAndProduce } from "../../../../../core/pipeline/produce";
import { getVideoProject } from "../../../../../core/repo/projects";

export async function POST(req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const body = await req.json().catch(() => ({}));

  try {
    await approveScriptAndProduce(
      params.videoProjectId,
      body.ttsProviderOverride ?? null,
      typeof body.ttsVoiceIdOverride === "string" ? body.ttsVoiceIdOverride : null
    );
    return NextResponse.json({ project: await getVideoProject(params.videoProjectId) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
