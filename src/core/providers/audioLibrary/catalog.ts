import fs from "fs";
import path from "path";
import {
  AUDIO_LIBRARY_CATALOG,
  AUDIO_LIBRARY_DIR,
  AudioLibraryCatalog,
  AudioLibraryEntry,
  AudioLibraryType,
} from "./types";

function catalogPath(): string {
  return path.join(process.cwd(), AUDIO_LIBRARY_CATALOG);
}

function libraryRoot(): string {
  return path.join(process.cwd(), AUDIO_LIBRARY_DIR);
}

export function loadAudioLibrary(): AudioLibraryCatalog {
  const p = catalogPath();
  if (!fs.existsSync(p)) {
    return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as AudioLibraryCatalog;
    return {
      version: 1,
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
      entries: Array.isArray(raw.entries) ? raw.entries : [],
    };
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
  }
}

export function saveAudioLibrary(catalog: AudioLibraryCatalog): void {
  const root = libraryRoot();
  fs.mkdirSync(path.join(root, "music"), { recursive: true });
  fs.mkdirSync(path.join(root, "sfx"), { recursive: true });
  catalog.updatedAt = new Date().toISOString();
  fs.writeFileSync(catalogPath(), JSON.stringify(catalog, null, 2), "utf8");
}

export function resolveLibraryFile(entry: AudioLibraryEntry): string {
  return path.join(libraryRoot(), entry.file);
}

export function listLibraryEntries(opts?: {
  type?: AudioLibraryType;
  channelId?: string;
  preferNoAttribution?: boolean;
}): AudioLibraryEntry[] {
  let entries = loadAudioLibrary().entries.filter((e) => e.enabled !== false);
  if (opts?.type) entries = entries.filter((e) => e.type === opts.type);
  if (opts?.channelId) {
    entries = entries.filter((e) => !(e.blockedBy ?? []).includes(opts.channelId!));
  }
  if (opts?.preferNoAttribution) {
    const noAttr = entries.filter((e) => !e.attributionRequired);
    if (noAttr.length) entries = noAttr;
  }
  // Favorites first
  if (opts?.channelId) {
    entries = [...entries].sort((a, b) => {
      const af = (a.favoritedBy ?? []).includes(opts.channelId!) ? 1 : 0;
      const bf = (b.favoritedBy ?? []).includes(opts.channelId!) ? 1 : 0;
      return bf - af;
    });
  }
  return entries;
}

export function getLibraryEntry(id: string): AudioLibraryEntry | null {
  return loadAudioLibrary().entries.find((e) => e.id === id) ?? null;
}

export function setLibraryFavorite(entryId: string, channelId: string, favorite: boolean): void {
  const catalog = loadAudioLibrary();
  const entry = catalog.entries.find((e) => e.id === entryId);
  if (!entry) return;
  const set = new Set(entry.favoritedBy ?? []);
  if (favorite) set.add(channelId);
  else set.delete(channelId);
  entry.favoritedBy = [...set];
  saveAudioLibrary(catalog);
}

export function setLibraryBlocked(entryId: string, channelId: string, blocked: boolean): void {
  const catalog = loadAudioLibrary();
  const entry = catalog.entries.find((e) => e.id === entryId);
  if (!entry) return;
  const set = new Set(entry.blockedBy ?? []);
  if (blocked) set.add(channelId);
  else set.delete(channelId);
  entry.blockedBy = [...set];
  saveAudioLibrary(catalog);
}

/** Score music/SFX entry against script text + desired moods. */
export function scoreLibraryEntry(
  entry: AudioLibraryEntry,
  args: { scriptText: string; moods?: string[]; intensity?: string }
): number {
  const text = (args.scriptText || "").toLowerCase();
  const wanted = new Set((args.moods ?? []).map((m) => m.toLowerCase()));
  let score = 0;
  for (const mood of entry.mood) {
    if (wanted.has(mood.toLowerCase())) score += 3;
    if (text.includes(mood.toLowerCase())) score += 1;
  }
  if (args.intensity && entry.intensity === args.intensity) score += 2;
  // Prefer no-attribution tracks
  if (!entry.attributionRequired) score += 2;
  if (entry.licenseType === "dev-placeholder") score -= 1;
  return score;
}

export function pickBestLibraryEntry(
  type: AudioLibraryType,
  args: {
    scriptText: string;
    moods?: string[];
    intensity?: string;
    channelId?: string;
    excludeIds?: string[];
    categoryHint?: string;
  }
): AudioLibraryEntry | null {
  const ranked = rankLibraryEntries(type, args);
  if (ranked.length === 0) return null;
  // Among top scores, rotate so videos don't all share the same bed.
  const topScore = ranked[0].score;
  const top = ranked.filter((r) => r.score >= topScore - 1);
  return top[Math.floor(Math.random() * top.length)]?.entry ?? ranked[0].entry;
}

/** Ranked music/SFX candidates for UI preview pickers. */
export function rankLibraryEntries(
  type: AudioLibraryType,
  args: {
    scriptText: string;
    moods?: string[];
    intensity?: string;
    channelId?: string;
    excludeIds?: string[];
    categoryHint?: string;
    limit?: number;
  }
): Array<{ entry: AudioLibraryEntry; score: number }> {
  const exclude = new Set(args.excludeIds ?? []);
  let pool = listLibraryEntries({
    type,
    channelId: args.channelId,
    preferNoAttribution: true,
  }).filter((e) => !exclude.has(e.id));

  if (args.categoryHint) {
    const hinted = pool.filter((e) => e.category.toLowerCase() === args.categoryHint!.toLowerCase());
    if (hinted.length) pool = hinted;
  }

  if (pool.length === 0) return [];

  const ranked = pool
    .map((e) => ({ entry: e, score: scoreLibraryEntry(e, args) }))
    .sort((a, b) => b.score - a.score);

  const limit = Math.max(1, Math.min(30, args.limit ?? 12));
  return ranked.slice(0, limit);
}

export function moodsFromScript(scriptText: string): string[] {
  const t = scriptText.toLowerCase();
  const moods: string[] = [];
  if (/oración|oracion|amén|amen|dios|virgen|santo|arcángel|arcangel|pomba|cipriano/.test(t)) {
    moods.push("espiritual", "oracion", "romantico");
  }
  if (/silencio|noche|oscur|mister/.test(t)) moods.push("espiritual", "emocional");
  if (/llorar|dolor|herid|abandono|bloqueo/.test(t)) moods.push("emocional", "romantico");
  if (/amor|coraz[oó]n|besar|románt|regres|vuelve|llame/.test(t)) moods.push("romantico", "emocional", "espiritual");
  if (/esperanza|perdón|perdon|amén|paz|gracias/.test(t)) moods.push("esperanca", "espiritual");
  // Avoid pushing "misterio"/"tensao" as primary — those beds sound like meditation drones.
  if (moods.length === 0) moods.push("espiritual", "oracion", "romantico");
  return [...new Set(moods)];
}
