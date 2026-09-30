import fs from "fs";
import path from "path";
import { DATA_ROOT, ensureDir } from "../paths";
import { getDb } from "../db";
import { getSupabase, isSupabaseEnabled } from "../supabaseClient";

export type ProjectPublishMeta = {
  headline?: string | null;
  youtubeDescription?: string | null;
  /** When true, after TTS run music/SFX + scrolling video automatically. */
  autoFlow?: boolean;
  youtubeVideoId?: string | null;
  youtubeUrl?: string | null;
  youtubeUploadedAt?: string | null;
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

export async function writeProjectPublish(
  projectId: string,
  meta: ProjectPublishMeta
): Promise<ProjectPublishMeta> {
  const prev = readProjectPublish(projectId) ?? {};
  const merged: ProjectPublishMeta = {
    ...prev,
    ...meta,
    updatedAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(overlayPath(projectId), JSON.stringify(merged, null, 2), "utf8");
  } catch (err) {
    // Vercel’s /var/task is read-only. The row in the database is the copy that survives.
    console.warn(
      "[publish] disk overlay skipped:",
      err instanceof Error ? err.message : err
    );
  }
  await persistPublishRow(projectId, merged).catch((err) => {
    console.warn("[publish] db overlay skipped:", err instanceof Error ? err.message : err);
  });
  return merged;
}

async function persistPublishRow(projectId: string, merged: ProjectPublishMeta): Promise<void> {
  if (isSupabaseEnabled()) {
    const supabase = getSupabase();
    let res = await supabase.from("video_projects").update({ publish_json: merged }).eq("id", projectId);
    if (res.error && /publish_json|column|schema cache/i.test(res.error.message)) {
      const { ensureAudioBedColumns } = await import("./ensureAudioBedColumns");
      await ensureAudioBedColumns();
      res = await supabase.from("video_projects").update({ publish_json: merged }).eq("id", projectId);
    }
    if (res.error) throw new Error(res.error.message);
    return;
  }
  getDb()
    .prepare(`UPDATE video_projects SET publish_json = ? WHERE id = ?`)
    .run(JSON.stringify(merged), projectId);
}

export function deleteProjectPublish(projectId: string): void {
  try {
    fs.rmSync(overlayPath(projectId), { force: true });
  } catch {
    // best-effort
  }
}
