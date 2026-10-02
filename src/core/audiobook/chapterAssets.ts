import path from "path";
import { ensureDir } from "../paths";
import { audiobookStorageDir } from "./paths";

const FOLDERS = ["audio", "images", "thumbnails", "ai-video", "motion", "timeline", "final"] as const;

export type ChapterAssetFolder = (typeof FOLDERS)[number];

export function chapterAssetDir(channelId: string, bookFolder: string, chapterIndex: number): string {
  const name = `chapter-${String(chapterIndex).padStart(3, "0")}`;
  return path.join(audiobookStorageDir(channelId, bookFolder), name);
}

/** Layout for one chapter. Call only for the chapter under test, not the whole library. */
export function ensureChapterAssetDirs(
  channelId: string,
  bookFolder: string,
  chapterIndex: number
): Record<ChapterAssetFolder, string> {
  const root = chapterAssetDir(channelId, bookFolder, chapterIndex);
  const out = {} as Record<ChapterAssetFolder, string>;
  for (const folder of FOLDERS) {
    out[folder] = ensureDir(path.join(root, folder));
  }
  return out;
}
