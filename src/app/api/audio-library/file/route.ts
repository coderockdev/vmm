import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { listLibraryEntries } from "../../../../core/providers/audioLibrary/catalog";
import { AUDIO_LIBRARY_DIR } from "../../../../core/providers/audioLibrary/types";
import type { AudioLibraryEntry } from "../../../../core/providers/audioLibrary/types";

/** Stream a local library file for preview in the UI. */
export async function GET(req: NextRequest) {
  const file = new URL(req.url).searchParams.get("file");
  if (!file || file.includes("..") || path.isAbsolute(file)) {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }
  const known = listLibraryEntries().some((e: AudioLibraryEntry) => e.file === file);
  if (!known) return NextResponse.json({ error: "Not in catalog" }, { status: 404 });
  const abs = path.join(process.cwd(), AUDIO_LIBRARY_DIR, file);
  if (!fs.existsSync(abs)) return NextResponse.json({ error: "Missing file" }, { status: 404 });
  const buf = fs.readFileSync(abs);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
