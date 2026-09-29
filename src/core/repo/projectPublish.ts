import fs from "fs";
import path from "path";
import { DATA_ROOT, ensureDir } from "../paths";

export type ProjectPublishMeta = {
  headline?: string | null;
  youtubeDescription?: string | null;
  /** When true, after TTS run music/SFX + scrolling video automatically. */
  autoFlow?: boolean;
  updatedAt?: string;
};

function overlayDir(): string {
  return ensureDir(path.join(DATA_ROOT, "project-publish"));
}

function overlayPath(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(overlayDir(), `${safe}.json`);
}

export function readProjectPublish(projectId: string): ProjectPublishMeta | null {
  try {
    const p = overlayPath(projectId);
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    return raw as ProjectPublishMeta;
  } catch {
    return null;
  }
}

export function writeProjectPublish(projectId: string, meta: ProjectPublishMeta): ProjectPublishMeta {
  const prev = readProjectPublish(projectId) ?? {};
  const merged: ProjectPublishMeta = {
    ...prev,
    ...meta,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(overlayPath(projectId), JSON.stringify(merged, null, 2), "utf8");
  return merged;
}
