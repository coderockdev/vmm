import { NextRequest, NextResponse } from "next/server";
import { regenerateScript } from "../../../../../core/pipeline/produce";

export async function POST(req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const body = await req.json().catch(() => ({}));

  try {
    const script = await regenerateScript(params.videoProjectId, body.aiProviderOverride ?? null);
    return NextResponse.json({ script });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
