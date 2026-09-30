import { NextRequest, NextResponse } from "next/server";
import { produceAudioBed } from "../../../../../core/pipeline/produceAudioBed";
import { getVideoProject } from "../../../../../core/repo/projects";
import { ensureAudioBedColumns } from "../../../../../core/repo/ensureAudioBedColumns";
import { listLibraryEntries, moodsFromScript, rankLibraryEntries } from "../../../../../core/providers/audioLibrary/catalog";
import { getChannel } from "../../../../../core/repo/channels";
import { getScript } from "../../../../../core/repo/projects";
import { normalizeMusicalDna } from "../../../../../core/providers/music/musicalDna";
import type { AudioLibraryEntry } from "../../../../../core/providers/audioLibrary/types";

/** Generate/select music + SFX from VMM library and mix with narration. */
export async function POST(req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const body = await req.json().catch(() => ({}));
  try {
    await ensureAudioBedColumns().catch(() => false);
    const result = await produceAudioBed({
      projectId: params.videoProjectId,
      musicOnly: Boolean(body.musicOnly),
      sfxOnly: Boolean(body.sfxOnly),
      musicOff: Boolean(body.musicOff),
      sfxOff: Boolean(body.sfxOff),
      remixOnly: Boolean(body.remixOnly),
      styleOverride: typeof body.style === "string" ? body.style : null,
      musicVolume: typeof body.musicVolume === "number" ? body.musicVolume : null,
      sfxVolume: typeof body.sfxVolume === "number" ? body.sfxVolume : null,
      libraryEntryId: typeof body.libraryEntryId === "string" ? body.libraryEntryId : null,
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
  const script = project.scriptId ? await getScript(project.scriptId) : null;
  const scriptText = script?.rawText ?? script?.lines.map((l) => l.text).join("\n") ?? project.title;
  const musical = normalizeMusicalDna(channel?.dna.musical);
  const moods = moodsFromScript(scriptText);

  const ranked =
    type === "music"
      ? rankLibraryEntries("music", {
          scriptText: `${scriptText} ${musical.defaultStyle}`,
          moods:
            project.channelId === "amor-amor"
              ? ["espiritual", "oracion", "romantico", "emocional", "esperanca", ...moods]
              : moods,
          intensity: musical.intensity,
          channelId: project.channelId,
          limit: 12,
        })
      : [];

  const entries = (
    ranked.length > 0
      ? ranked.map((r) => r.entry)
      : listLibraryEntries({
          type,
          channelId: project.channelId,
          preferNoAttribution: true,
        })
  ).map((e: AudioLibraryEntry) => ({
    id: e.id,
    name: e.name,
    file: e.file,
    type: e.type,
    mood: e.mood,
    intensity: e.intensity,
    attributionRequired: e.attributionRequired,
    previewUrl: `/api/audio-library/file?file=${encodeURIComponent(e.file)}`,
    score: ranked.find((r) => r.entry.id === e.id)?.score ?? null,
  }));

  return NextResponse.json({
    entries,
    selectedLibraryId: project.musicLibraryId ?? null,
    musical: channel?.dna.musical ?? null,
    project,
  });
}
