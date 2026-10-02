import { NextRequest, NextResponse } from "next/server";
import { retryPendingCovers } from "../../../../core/youtube/pendingCovers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * After the shared 10,000-point pool resets (midnight Pacific, ~04:00 Argentina).
 * Attaches covers that were already painted. Does not upload videos: those use
 * the separate 100-a-day bucket and are sent when they are rendered.
 * Vercel runs this. The office computer can be off.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const result = await retryPendingCovers();
  return NextResponse.json(result);
}
