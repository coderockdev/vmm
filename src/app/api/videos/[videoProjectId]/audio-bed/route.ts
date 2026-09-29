import { NextRequest, NextResponse } from "next/server";
import { produceAudioBed } from "../../../../../core/pipeline/produceAudioBed";
import { getVideoProject } from "../../../../../core/repo/projects";
import { listLibraryEntries } from "../../../../../core/providers/audioLibrary/catalog";
import { getChannel } from "../../../../../core/repo/channels";
import type { AudioLibraryEntry } from "../../../../../core/providers/audioLibrary/types";

/** Generate/select music + SFX from VMM library and mix with narration. */
export async function POST(req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const body = await req.json().catch(() => ({}));
  try {
    const result = await produceAudioBed({
      projectId: params.videoProjectId,
      musicOnly: Boolean(body.musicOnly),
      sfxOnly: Boolean(body.sfxOnly),
      musicOff: Boolean(body.musicOff),
      sfxOff: Boolean(body.sfxOff),
      styleOverride: typeof body.style === "string" ? body.style : null,
    });
    return NextResponse.json({ project: result.project });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** List library tracks for the picker (music or sfx). */
export async function GET(req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const project = await getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const channel = await getChannel(project.channelId);
  const type = new URL(req.url).searchParams.get("type") === "sfx" ? "sfx" : "music";
  const entries = listLibraryEntries({
    type,
    channelId: project.channelId,
    preferNoAttribution: true,
  }).map((e: AudioLibraryEntry) => ({
    id: e.id,
    name: e.name,
    file: e.file,
    type: e.type,
    mood: e.mood,
    attributionRequired: e.attributionRequired,
  }));
  return NextResponse.json({
    entries,
    musical: channel?.dna.musical ?? null,
    project,
  });
}
