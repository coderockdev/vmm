import fs from "fs";
import path from "path";
import { DATA_ROOT, ensureDir } from "../../paths";
import { getLibraryEntry } from "../audioLibrary/catalog";
import type { AudioLibraryEntry } from "../audioLibrary/types";

/**
 * Atomic round-robin through channel standard music ids.
 * Survives parallel auto-flow jobs (file counter under data/).
 */
export function takeNextStandardMusic(args: {
  channelId: string;
  standardIds: string[];
}): AudioLibraryEntry | null {
  const ids = args.standardIds.map(String).filter(Boolean);
  if (ids.length === 0) return null;

  const dir = ensureDir(path.join(DATA_ROOT, "music-rotation"));
  const file = path.join(dir, `${args.channelId.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);

  let index = 0;
  try {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { index?: number };
      index = Number(raw.index) || 0;
    }
  } catch {
    index = 0;
  }

  const pick = ((index % ids.length) + ids.length) % ids.length;
  const nextIndex = pick + 1;
  try {
    fs.writeFileSync(file, JSON.stringify({ index: nextIndex, updatedAt: new Date().toISOString() }, null, 2));
  } catch {
    // best-effort
  }

  const id = ids[pick];
  const entry = getLibraryEntry(id);
  if (entry && entry.type === "music" && entry.enabled !== false) return entry;

  // Fallback: first available standard still on disk
  for (const candidate of ids) {
    const e = getLibraryEntry(candidate);
    if (e && e.type === "music" && e.enabled !== false) return e;
  }
  return null;
}
