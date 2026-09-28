import path from "path";
import fs from "fs";

// All local, mutable data (db + generated media) lives under <project>/data
export const DATA_ROOT = path.join(process.cwd(), "data");
export const DB_PATH = path.join(DATA_ROOT, "vmm.sqlite");

// Creating these directories is only ever needed in local-storage mode. On a
// read-only filesystem (Vercel serverless functions, most notably) this
// throws — harmlessly, since remote-storage mode never actually reads the
// path it just failed to create. Swallow it instead of crashing on import.
export function ensureDir(dir: string): string {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // read-only filesystem — fine in remote-storage mode, see above.
  }
  return dir;
}

export function channelDir(channelId: string): string {
  return ensureDir(path.join(DATA_ROOT, "channels", channelId));
}

export function channelAudioDir(channelId: string): string {
  return ensureDir(path.join(channelDir(channelId), "audio"));
}

export function channelRendersDir(channelId: string): string {
  return ensureDir(path.join(channelDir(channelId), "renders"));
}

export function channelTmpDir(channelId: string): string {
  return ensureDir(path.join(channelDir(channelId), "tmp"));
}

ensureDir(DATA_ROOT);
