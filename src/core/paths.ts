import path from "path";
import fs from "fs";

// All local, mutable data (db + generated media) lives under <project>/data
export const DATA_ROOT = path.join(process.cwd(), "data");
export const DB_PATH = path.join(DATA_ROOT, "vmm.sqlite");

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
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
