import path from "path";
import fs from "fs";
import { getChannel } from "../repo/channels";
import {
  getVideoProject,
  getScript,
  getAudioAsset,
  updateProjectAudioBed,
  withAudioBed,
} from "../repo/projects";
import { getMusicProvider } from "../providers/music";
import { getSfxProvider } from "../providers/sfx";
import { normalizeMusicalDna } from "../providers/music/musicalDna";
import { mixNarrationWithBed } from "../audio/mixNarrationBed";
import { ensureLocalFile, persistFile, workingFilePath } from "../storage";
import { insertUsageEvent } from "../repo/usage";
import { channelTmpDir } from "../paths";
import { getLibraryEntry, listLibraryEntries } from "../providers/audioLibrary/catalog";

async function ensureAudioLibrarySeeded(): Promise<void> {
  if (listLibraryEntries().length > 0) return;
  const { spawnSync } = await import("child_process");
  spawnSync("npx", ["tsx", "scripts/seed-audio-library.ts"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
}

/**
 * Generate/select instrumental music + SFX from the VMM library and mix with narration.
 * Does NOT regenerate voice. Partial: musicOnly / sfxOnly / remixOnly supported.
 */
export async function produceAudioBed(args: {
  projectId: string;
  musicOnly?: boolean;
  sfxOnly?: boolean;
  musicOff?: boolean;
  sfxOff?: boolean;
  /** Keep existing music/SFX refs; only re-mix with new volumes. */
  remixOnly?: boolean;
  styleOverride?: string | null;
  musicVolume?: number | null;
  sfxVolume?: number | null;
  /** Force a specific library music track (Audio tab picker). */
  libraryEntryId?: string | null;
}): Promise<{ project: NonNullable<Awaited<ReturnType<typeof getVideoProject>>> }> {
  await ensureAudioLibrarySeeded();

  const project = await getVideoProject(args.projectId);
  if (!project) throw new Error("Project not found");
  const channel = await getChannel(project.channelId);
  if (!channel) throw new Error("Channel not found");
  if (!project.audioAssetId) throw new Error("Gere a voz antes da música/SFX.");

  const asset = await getAudioAsset(project.audioAssetId);
  if (!asset) throw new Error("Áudio de narração não encontrado.");

  const script = project.scriptId ? await getScript(project.scriptId) : null;
  const scriptText = script?.rawText ?? script?.lines.map((l) => l.text).join("\n\n") ?? "";
  const musical = normalizeMusicalDna(channel.dna.musical);
  const musicVolume =
    typeof args.musicVolume === "number" && Number.isFinite(args.musicVolume)
      ? Math.min(1, Math.max(0, args.musicVolume))
      : typeof project.musicVolume === "number"
        ? project.musicVolume
        : musical.volume;
  const sfxVolume =
    typeof args.sfxVolume === "number" && Number.isFinite(args.sfxVolume)
      ? Math.min(1, Math.max(0, args.sfxVolume))
      : typeof project.sfxVolume === "number"
        ? project.sfxVolume
        : musical.sfxVolume;

  const narrationLocal = await ensureLocalFile(
    channel.id,
    asset.filePath,
    `narration${path.extname(asset.filePath) || ".mp3"}`
  );
  const tmpDir = path.join(channelTmpDir(channel.id), project.id, "bed");
  fs.mkdirSync(tmpDir, { recursive: true });

  const keepExisting = Boolean(args.remixOnly || args.musicOnly || args.sfxOnly);
  let musicRef = keepExisting ? project.musicRef : null;
  let sfxRef = keepExisting ? project.sfxRef : null;
  let musicStyle = project.musicStyle;
  let musicLibraryId = keepExisting ? project.musicLibraryId : null;
  let musicTrackName = keepExisting ? project.musicTrackName : null;
  let markers = project.productionMarkers ?? [];
  let sfxCues = keepExisting ? project.sfxCues : null;
  let attributionText: string | null = null;

  const doMusic =
    !args.remixOnly &&
    !args.sfxOnly &&
    !args.musicOff &&
    (musical.useMusicByDefault || args.musicOnly);
  const doSfx =
    !args.remixOnly &&
    !args.musicOnly &&
    !args.sfxOff &&
    (musical.useSfx && musical.sfxMode !== "off" || args.sfxOnly);

  if (args.musicOff) {
    musicRef = null;
    musicStyle = null;
    musicLibraryId = null;
    musicTrackName = null;
  }
  if (args.sfxOff) {
    sfxRef = null;
    markers = [];
    sfxCues = null;
  }

  if (doMusic) {
    const music = await getMusicProvider().generate({
      channelId: channel.id,
      videoProjectId: project.id,
      durationSeconds: asset.durationSeconds,
      style: (args.styleOverride as any) || musical.defaultStyle,
      intensity: musical.intensity,
      instructions: musical.customMusicInstructions,
      scriptText: musical.adaptToScript ? scriptText : undefined,
      outDir: tmpDir,
      fileBaseName: `music-${project.id}`,
      libraryEntryId: args.libraryEntryId ?? null,
    });
    musicRef = await persistFile(
      music.filePath,
      channel.id,
      "audio",
      `music-${project.id}.mp3`,
      "audio/mpeg"
    );
    musicStyle = music.style;
    musicLibraryId = music.libraryEntryId ?? null;
    musicTrackName = music.libraryEntryId
      ? getLibraryEntry(music.libraryEntryId)?.name ?? music.libraryEntryId
      : null;
    attributionText = music.attributionText || null;
    await insertUsageEvent({
      channelId: channel.id,
      contentIdeaId: project.contentIdeaId,
      videoProjectId: project.id,
      stage: "music",
      snapshot: {
        provider: "local",
        model: music.provider,
        durationSeconds: music.durationSeconds,
      },
    }).catch(() => undefined);
  }

  if (doSfx) {
    const sfxProvider = getSfxProvider();
    const scriptLines = script?.lines ?? [];
    const events = sfxProvider.planEvents({
      scriptText,
      durationSeconds: asset.durationSeconds,
      allowed: musical.allowedSfx,
      forbidden: musical.forbiddenSfx,
      intensity: musical.sfxIntensity,
      timedLines: scriptLines.map((l) => ({
        text: l.text,
        start: Number(l.start) || 0,
        end: Number(l.end) || undefined,
      })),
    });
    markers = events.map((e) => e.marker);
    const bed = await sfxProvider.renderBed({
      events,
      durationSeconds: asset.durationSeconds,
      outDir: tmpDir,
      fileBaseName: `sfx-${project.id}`,
      channelId: channel.id,
      scriptText,
    });
    sfxCues = bed.events.map((e) => ({
      at: fmtCue(e.atSeconds),
      label: sfxLabel(e.kind),
      trackName: e.trackName,
    }));
    markers = bed.events.map((e) => e.marker);
    sfxRef = await persistFile(
      bed.filePath,
      channel.id,
      "audio",
      `sfx-${project.id}.mp3`,
      "audio/mpeg"
    );
    await insertUsageEvent({
      channelId: channel.id,
      contentIdeaId: project.contentIdeaId,
      videoProjectId: project.id,
      stage: "sfx",
      snapshot: {
        provider: "local",
        model: bed.provider,
        durationSeconds: asset.durationSeconds,
        characters: events.length,
      },
    }).catch(() => undefined);
  }

  // Mix variants: voice+music, voice+sfx, voice+music+sfx
  let mixMusicRef: string | null = null;
  let mixSfxRef: string | null = null;
  let mixAudioRef: string | null = null;

  const channelId = channel.id;
  const projectId = project.id;
  const ducking = musical.ducking;

  const musicLocal = musicRef
    ? await ensureLocalFile(channelId, musicRef, `music-${projectId}.mp3`)
    : null;
  const sfxLocal = sfxRef
    ? await ensureLocalFile(channelId, sfxRef, `sfx-${projectId}.mp3`)
    : null;

  async function persistMix(
    fileBase: string,
    musicPath: string | null,
    sfxPath: string | null
  ): Promise<string> {
    const mixOut = workingFilePath(channelId, "audio", `${fileBase}-${projectId}.mp3`);
    await mixNarrationWithBed({
      narrationPath: narrationLocal,
      musicPath,
      sfxPath,
      musicVolume,
      sfxVolume,
      ducking,
      voiceWarmth: channelId === "amor-amor",
      outputPath: mixOut,
    });
    return persistFile(mixOut, channelId, "audio", `${fileBase}-${projectId}.mp3`, "audio/mpeg");
  }

  if (musicLocal) {
    mixMusicRef = await persistMix("mix-music", musicLocal, null);
  }
  if (sfxLocal) {
    mixSfxRef = await persistMix("mix-sfx", null, sfxLocal);
  }
  if (musicLocal || sfxLocal) {
    mixAudioRef = await persistMix("mix", musicLocal, sfxLocal);
  }

  const bedPayload = {
    musicRef,
    musicStyle,
    musicLibraryId,
    musicTrackName,
    sfxRef,
    mixMusicRef,
    mixSfxRef,
    mixAudioRef,
    musicVolume,
    sfxVolume,
    productionMarkers: markers,
    sfxCues,
    attributionText,
  };

  await updateProjectAudioBed(projectId, bedPayload);

  const next = await getVideoProject(projectId);
  if (!next) throw new Error("Failed to reload project");
  // Always surface mix refs on the response (overlay / DB / in-memory).
  return { project: withAudioBed(next, bedPayload) };
}

function fmtCue(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function sfxLabel(kind: string): string {
  const map: Record<string, string> = {
    phone_vibrate: "Telefone (vibração)",
    phone_ring: "Telefone (toque)",
    message: "Mensagem",
    wind: "Vento",
    night: "Noite / silêncio",
    rain: "Chuva",
    heartbeat: "Batimento",
    whoosh: "Whoosh",
    impact: "Impacto",
    clock: "Relógio",
  };
  return map[kind] ?? kind;
}
