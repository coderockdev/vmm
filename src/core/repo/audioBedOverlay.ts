import fs from "fs";
import path from "path";
import { DATA_ROOT, ensureDir } from "../paths";

export type AudioBedOverlay = {
  musicRef?: string | null;
  musicStyle?: string | null;
  musicLibraryId?: string | null;
  musicTrackName?: string | null;
  sfxRef?: string | null;
  mixMusicRef?: string | null;
  mixSfxRef?: string | null;
  mixAudioRef?: string | null;
  musicVolume?: number | null;
  sfxVolume?: number | null;
  productionMarkers?: string[] | null;
  attributionText?: string | null;
  sfxCues?: Array<{ at: string; label: string; trackName?: string }> | null;
};

function overlayDir(): string {
  return ensureDir(path.join(DATA_ROOT, "audio-beds"));
}

function overlayPath(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(overlayDir(), `${safe}.json`);
}

export function readAudioBedOverlay(projectId: string): AudioBedOverlay | null {
  try {
    const p = overlayPath(projectId);
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    return raw as AudioBedOverlay;
  } catch {
    return null;
  }
}

export function writeAudioBedOverlay(projectId: string, bed: AudioBedOverlay): void {
  const p = overlayPath(projectId);
  fs.writeFileSync(p, JSON.stringify({ ...bed, updatedAt: new Date().toISOString() }, null, 2), "utf8");
}

/** Merge DB bed with disk overlay — non-null DB fields win. */
export function mergeAudioBed(
  fromDb: AudioBedOverlay | null | undefined,
  fromOverlay: AudioBedOverlay | null | undefined
): AudioBedOverlay | null {
  if (!fromDb && !fromOverlay) return null;
  const out: AudioBedOverlay = { ...(fromOverlay ?? {}) };
  if (fromDb) {
    for (const [key, value] of Object.entries(fromDb) as Array<[keyof AudioBedOverlay, AudioBedOverlay[keyof AudioBedOverlay]]>) {
      if (value !== null && value !== undefined) {
        (out as Record<string, unknown>)[key] = value;
      }
    }
  }
  return out;
}
