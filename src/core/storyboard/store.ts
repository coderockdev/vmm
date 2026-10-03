import fs from "fs";
import path from "path";
import { getSupabase, isSupabaseEnabled } from "../supabaseClient";
import { getVideoProject } from "../repo/projects";
import { DATA_ROOT, ensureDir } from "../paths";
import { ensureAudioBedColumns } from "../repo/ensureAudioBedColumns";
import { Storyboard, StoryboardShot, isVisualType } from "./types";

function overlayPath(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(ensureDir(path.join(DATA_ROOT, "storyboards")), `${safe}.json`);
}

function readOverlay(projectId: string): Storyboard | null {
  try {
    const file = overlayPath(projectId);
    if (!fs.existsSync(file)) return null;
    return normalizeBoard(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

function writeOverlay(board: Storyboard): void {
  fs.writeFileSync(overlayPath(board.videoProjectId), JSON.stringify(board), "utf8");
}

export function normalizeBoard(raw: unknown): Storyboard | null {
  if (!raw || typeof raw !== "object") return null;
  const board = raw as Storyboard;
  if (!board.videoProjectId || !Array.isArray(board.scenes)) return null;
  const scenes = board.scenes.map((scene, sceneIndex) => ({
    id: String(scene.id || crypto.randomUUID()),
    index: sceneIndex + 1,
    title: String(scene.title || "SCENE").slice(0, 80),
    shots: (scene.shots ?? []).map((shot, shotIndex) => normalizeShot(shot, shotIndex)),
  }));
  return {
    videoProjectId: String(board.videoProjectId),
    channelId: String(board.channelId || ""),
    title: String(board.title || ""),
    renderMode: board.renderMode === "cinematic" ? "cinematic" : "quick",
    status: board.status === "approved" ? "approved" : "draft",
    durationSec: Math.max(0, Number(board.durationSec) || 0),
    scenes,
    createdAt: String(board.createdAt || new Date().toISOString()),
    updatedAt: String(board.updatedAt || new Date().toISOString()),
  };
}

function normalizeShot(shot: StoryboardShot, index: number): StoryboardShot {
  const visualType = isVisualType(String(shot.visualType)) ? shot.visualType : "cinematic-image";
  return {
    ...shot,
    id: String(shot.id || crypto.randomUUID()),
    index: index + 1,
    startSec: Number(shot.startSec) || 0,
    endSec: Math.max(Number(shot.startSec) || 0, Number(shot.endSec) || 0),
    narration: String(shot.narration ?? ""),
    speech: Array.isArray(shot.speech) && shot.speech.length
      ? shot.speech.map((line) => ({
          text: String(line.text ?? ""),
          speakerId: String(line.speakerId || "narrator"),
          speakerName: String(line.speakerName || "Narrador"),
          voiceId: line.voiceId ?? null,
          emotion: line.emotion ?? null,
          delivery: line.delivery ?? null,
          voiceEffect: line.voiceEffect || "none",
        }))
      : [
          {
            text: String(shot.narration ?? ""),
            speakerId: "narrator",
            speakerName: "Narrador",
            voiceId: null,
            emotion: null,
            delivery: null,
            voiceEffect: "none" as const,
          },
        ],
    visualType,
    visual: String(shot.visual ?? ""),
    imagePrompt: String(shot.imagePrompt ?? ""),
    motion: String(shot.motion ?? ""),
    sfx: Array.isArray(shot.sfx) ? shot.sfx : [],
    musicMood: shot.musicMood || "none",
    musicAction: shot.musicAction || "continue",
    silenceSec: Math.max(0, Number(shot.silenceSec) || 0),
    onScreenText: String(shot.onScreenText ?? ""),
    transition: shot.transition === "fade" || shot.transition === "black" ? shot.transition : "cut",
    locationCard: shot.locationCard ?? null,
    map: shot.map ?? null,
    status: shot.status === "asset-ready" || shot.status === "failed" || shot.status === "skipped" ? shot.status : "planned",
    assetRef: shot.assetRef ?? null,
    error: shot.error ?? null,
  };
}

const MEDIA_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "media";

function storageKey(channelId: string, projectId: string): string {
  return `${channelId}/cover/storyboard-${projectId}.json`;
}

async function readStorage(projectId: string): Promise<Storyboard | null> {
  if (!isSupabaseEnabled()) return null;
  const project = await getVideoProject(projectId);
  if (!project) return null;
  const downloaded = await getSupabase().storage.from(MEDIA_BUCKET).download(storageKey(project.channelId, projectId));
  if (downloaded.error || !downloaded.data) return null;
  try {
    return normalizeBoard(JSON.parse(await downloaded.data.text()));
  } catch {
    return null;
  }
}

async function writeStorage(board: Storyboard): Promise<void> {
  if (!isSupabaseEnabled()) return;
  const uploaded = await getSupabase()
    .storage.from(MEDIA_BUCKET)
    .upload(storageKey(board.channelId, board.videoProjectId), JSON.stringify(board), {
      contentType: "application/json",
      upsert: true,
    });
  if (uploaded.error) console.warn("[storyboard] storage write failed:", uploaded.error.message);
}

export async function readStoryboard(projectId: string): Promise<Storyboard | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase().from("video_projects").select("storyboard_json").eq("id", projectId).maybeSingle();
    if (!res.error && res.data && "storyboard_json" in res.data) {
      const fromDb = normalizeBoard(res.data.storyboard_json);
      if (fromDb) return fromDb;
    }
    const stored = await readStorage(projectId);
    if (stored) return stored;
  }
  return readOverlay(projectId);
}

export async function writeStoryboard(board: Storyboard): Promise<Storyboard> {
  const next = { ...board, updatedAt: new Date().toISOString() };
  const normalized = normalizeBoard(next);
  if (!normalized) throw new Error("Storyboard inválido.");
  writeOverlay(normalized);
  if (!isSupabaseEnabled()) return normalized;

  const write = () =>
    getSupabase()
      .from("video_projects")
      .update({ storyboard_json: normalized, updated_at: normalized.updatedAt })
      .eq("id", normalized.videoProjectId);

  let res = await write();
  if (res.error && /storyboard_json|column/i.test(res.error.message)) {
    await ensureAudioBedColumns();
    res = await write();
  }
  if (res.error) {
    console.warn("[storyboard] database write failed, disk copy kept:", res.error.message);
  }
  await writeStorage(normalized);
  return normalized;
}
