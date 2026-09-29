import path from "path";
import fs from "fs";
import { getChannel } from "../repo/channels";
import {
  getVideoProject,
  getScript,
  getAudioAsset,
  updateProjectAudioBed,
} from "../repo/projects";
import { getMusicProvider } from "../providers/music";
import { getSfxProvider } from "../providers/sfx";
import { normalizeMusicalDna } from "../providers/music/musicalDna";
import { mixNarrationWithBed } from "../audio/mixNarrationBed";
import { ensureLocalFile, persistFile, workingFilePath } from "../storage";
import { insertUsageEvent } from "../repo/usage";
import { channelTmpDir } from "../paths";
import { listLibraryEntries } from "../providers/audioLibrary/catalog";

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
 * Does NOT regenerate voice. Partial: musicOnly / sfxOnly supported.
 */
export async function produceAudioBed(args: {
  projectId: string;
  musicOnly?: boolean;
  sfxOnly?: boolean;
  musicOff?: boolean;
  sfxOff?: boolean;
  styleOverride?: string | null;
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

  const narrationLocal = await ensureLocalFile(
    channel.id,
    asset.filePath,
    `narration${path.extname(asset.filePath) || ".mp3"}`
  );
  const tmpDir = path.join(channelTmpDir(channel.id), project.id, "bed");
  fs.mkdirSync(tmpDir, { recursive: true });

  let musicRef = args.musicOnly || args.sfxOnly ? project.musicRef : null;
  let sfxRef = args.musicOnly || args.sfxOnly ? project.sfxRef : null;
  let musicStyle = project.musicStyle;
  let markers = project.productionMarkers ?? [];
  let attributionText: string | null = null;

  const doMusic = !args.sfxOnly && !args.musicOff && (musical.useMusicByDefault || args.musicOnly);
  const doSfx =
    !args.musicOnly &&
    !args.sfxOff &&
    (musical.useSfx && musical.sfxMode !== "off" || args.sfxOnly);

  if (args.musicOff) {
    musicRef = null;
    musicStyle = null;
  }
  if (args.sfxOff) {
    sfxRef = null;
    markers = [];
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
    });
    musicRef = await persistFile(
      music.filePath,
      channel.id,
      "audio",
      `music-${project.id}.mp3`,
      "audio/mpeg"
    );
    musicStyle = music.style;
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
    const events = sfxProvider.planEvents({
      scriptText,
      durationSeconds: asset.durationSeconds,
      allowed: musical.allowedSfx,
      forbidden: musical.forbiddenSfx,
      intensity: musical.sfxIntensity,
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

  // Mix
  let mixAudioRef: string | null = null;
  if (musicRef || sfxRef) {
    const musicLocal = musicRef
      ? await ensureLocalFile(channel.id, musicRef, `music-${project.id}.mp3`)
      : null;
    const sfxLocal = sfxRef
      ? await ensureLocalFile(channel.id, sfxRef, `sfx-${project.id}.mp3`)
      : null;
    const mixOut = workingFilePath(channel.id, "audio", `mix-${project.id}.mp3`);
    await mixNarrationWithBed({
      narrationPath: narrationLocal,
      musicPath: musicLocal,
      sfxPath: sfxLocal,
      musicVolume: musical.volume,
      ducking: musical.ducking,
      outputPath: mixOut,
    });
    mixAudioRef = await persistFile(
      mixOut,
      channel.id,
      "audio",
      `mix-${project.id}.mp3`,
      "audio/mpeg"
    );
  }

  await updateProjectAudioBed(project.id, {
    musicRef,
    musicStyle,
    sfxRef,
    mixAudioRef,
    productionMarkers: markers,
    attributionText,
  });

  const next = await getVideoProject(project.id);
  if (!next) throw new Error("Failed to reload project");
  return { project: next };
}
