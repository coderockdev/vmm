import { NextRequest, NextResponse } from "next/server";
import { getJob } from "../../../../core/repo/jobs";

export async function GET(_req: NextRequest, { params }: { params: { jobId: string } }) {
  const job = getJob(params.jobId);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job });
}
