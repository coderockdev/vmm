import fs from "fs";
import os from "os";
import path from "path";
import { getSupabase } from "../supabaseClient";
import { channelAudioDir, channelRendersDir, channelDir } from "../paths";

export type StorageKind = "audio" | "cover" | "render";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "media";

/**
 * "local" (default) writes generated files straight into ./data — zero
 * setup, works great on your own machine. "supabase" uploads them to
 * Supabase Storage instead, which is required wherever the filesystem isn't
 * persistent/writable (Vercel serverless functions only get a throwaway
 * /tmp). STORAGE_PROVIDER lets you force either one; left unset, it
 * auto-detects: Vercel (which always sets VERCEL=1) switches it on by
 * itself, and so does DB_PROVIDER=supabase — the two are meant to travel
 * together (there's no real setup that wants a shared Supabase database but
 * per-machine local files), so pointing the DB at Supabase is enough to move
 * files there too without a second env var to remember.
 */
export function isUrl(ref: string): boolean {
  return /^https?:\/\//i.test(ref);
}

export function isRemoteStorageEnabled(): boolean {
  const explicit = process.env.STORAGE_PROVIDER;
  if (explicit) return explicit.toLowerCase() === "supabase";
  return Boolean(process.env.VERCEL) || (process.env.DB_PROVIDER ?? "sqlite").toLowerCase() === "supabase";
}

/**
 * Where a provider (TTS engine, image generator, Lambda's output download)
 * should write bytes while producing a file. In local mode this IS the
 * permanent home (under data/channels/...). In remote mode it's throwaway
 * scratch space — persistFile() uploads it and deletes it right after.
 */
export function workingFilePath(channelId: string, kind: StorageKind, fileName: string): string {
  if (isRemoteStorageEnabled()) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vmm-${kind}-`));
    return path.join(dir, fileName);
  }
  const dir = kind === "render" ? channelRendersDir(channelId) : kind === "audio" ? channelAudioDir(channelId) : channelDir(channelId);
  return path.join(dir, fileName);
}

/**
 * Call after finishing a write to workingFilePath(). Returns the durable
 * reference to store in the DB: unchanged (relative-to-channel-dir path) in
 * local mode, or the uploaded object's public URL in remote mode.
 */
export async function persistFile(
  localFilePath: string,
  channelId: string,
  kind: StorageKind,
  fileName: string,
  contentType: string
): Promise<string> {
  if (!isRemoteStorageEnabled()) {
    if (kind === "render") return path.join("renders", fileName);
    if (kind === "audio") return path.join("audio", fileName);
    return fileName;
  }

  const buffer = fs.readFileSync(localFilePath);
  const objectKey = `${channelId}/${kind}/${fileName}`;
  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(objectKey, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Supabase Storage upload failed for ${objectKey}: ${error.message}`);

  fs.rmSync(path.dirname(localFilePath), { recursive: true, force: true });

  const { data } = getSupabase().storage.from(BUCKET).getPublicUrl(objectKey);
  return data.publicUrl;
}

/** Resolves a relative-mode ref back into an absolute local path (local storage only — callers must check the ref isn't a URL first). */
export function resolveChannelRelativePath(channelId: string, ref: string): string {
  return path.join(channelDir(channelId), ref);
}

/**
 * Guarantees a real local file for code that can only work with one (ffmpeg
 * mixing, uploading to Remotion's own S3 bucket). A relative ref already has
 * one (local storage); a URL ref (remote storage) gets downloaded into a
 * throwaway temp file — call sites should treat the result as disposable.
 */
export async function ensureLocalFile(channelId: string, ref: string, fileName: string): Promise<string> {
  if (!isUrl(ref)) {
    return resolveChannelRelativePath(channelId, ref);
  }
  const response = await fetch(ref);
  if (!response.ok) throw new Error(`Failed to download ${ref}: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vmm-dl-"));
  const dest = path.join(dir, fileName);
  fs.writeFileSync(dest, buffer);
  return dest;
}

/** Deletes a stored file given its DB ref — the local copy (local storage) or the Supabase Storage object it points to (remote storage). Safe to call with null/undefined. */
export async function deleteStoredFile(channelId: string, ref: string | null | undefined): Promise<void> {
  if (!ref) return;
  if (!isUrl(ref)) {
    fs.rmSync(resolveChannelRelativePath(channelId, ref), { force: true });
    return;
  }
  const prefix = `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
  if (ref.startsWith(prefix)) {
    const objectKey = ref.slice(prefix.length);
    await getSupabase().storage.from(BUCKET).remove([objectKey]).catch(() => {});
  }
}
