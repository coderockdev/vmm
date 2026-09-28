import { NextRequest, NextResponse } from "next/server";

/**
 * Free HeyGen voice preview. Tries voices list preview_audio for "Juan Carlos"
 * or a provided voice id. Never generates video.
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "HEYGEN_API_KEY não configurada.",
        previewUrl: null,
        message: "Prévia só no editor do HeyGen",
      },
      { status: 200 }
    );
  }

  const { searchParams } = new URL(req.url);
  const name = (searchParams.get("name") ?? "Juan Carlos").toLowerCase();

  try {
    const res = await fetch("https://api.heygen.com/v2/voices", {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
    });
    if (!res.ok) {
      return NextResponse.json({
        previewUrl: null,
        message: "Prévia só no editor do HeyGen",
        error: `HeyGen voices (${res.status})`,
      });
    }
    const data = await res.json();
    const list = data?.data?.voices ?? data?.voices ?? [];
    const match =
      list.find((v: any) => String(v.name ?? "").toLowerCase().includes(name)) ??
      list.find((v: any) => String(v.display_name ?? "").toLowerCase().includes(name));
    const previewUrl =
      match?.preview_audio ?? match?.preview_url ?? match?.previewAudio ?? null;
    return NextResponse.json({
      previewUrl,
      message: previewUrl ? null : "Prévia só no editor do HeyGen",
      voiceId: match?.voice_id ?? match?.id ?? null,
    });
  } catch {
    return NextResponse.json({
      previewUrl: null,
      message: "Prévia só no editor do HeyGen",
      error: "Sem conexão com HeyGen.",
    });
  }
}
