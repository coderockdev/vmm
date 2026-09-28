import { NextRequest, NextResponse } from "next/server";
import { setIdeaStatus } from "../../../../core/repo/plans";

export async function DELETE(_req: NextRequest, { params }: { params: { ideaId: string } }) {
  await setIdeaStatus(params.ideaId, "removed");
  return NextResponse.json({ ok: true });
}
