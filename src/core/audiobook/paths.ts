import path from "path";
import { DATA_ROOT, ensureDir } from "../paths";

/** Root for imported book packages (local). */
export const BOOKS_ROOT = path.join(DATA_ROOT, "books");

export const JULIO_VERNE_PACKAGE = "julio_verne_capitulos";

export function julioVernePackageDir(): string {
  return path.join(BOOKS_ROOT, JULIO_VERNE_PACKAGE);
}

export function bookSourceDir(folder: string): string {
  return path.join(julioVernePackageDir(), folder);
}

export function audiobookStorageDir(channelId: string, bookFolder: string): string {
  return ensureDir(path.join(DATA_ROOT, "channels", channelId, "audiobooks", bookFolder));
}
