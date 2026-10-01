import fs from "fs";
import os from "os";
import path from "path";
import { getSupabase } from "../supabaseClient";
import { channelAudioDir, channelRendersDir, channelDir } from "../paths";

export type StorageKind = "audio" | "cover" | "render" | "thumbnails";

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
function relativeRefForKind(kind: StorageKind, fileName: string): string {
  if (kind === "render") return path.join("renders", fileName);
  if (kind === "audio") return path.join("audio", fileName);
  return fileName;
}

function durableLocalPath(channelId: string, kind: StorageKind, fileName: string): string {
  const dir =
    kind === "render"
      ? channelRendersDir(channelId)
      : kind === "audio"
        ? channelAudioDir(channelId)
        : channelDir(channelId);
  return path.join(dir, fileName);
}

export async function persistFile(
  localFilePath: string,
  channelId: string,
  kind: StorageKind,
  fileName: string,
  contentType: string
): Promise<string> {
  if (!isRemoteStorageEnabled()) {
    return relativeRefForKind(kind, fileName);
  }

  const buffer = fs.readFileSync(localFilePath);
  const objectKey = `${channelId}/${kind}/${fileName}`;
  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(objectKey, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Supabase Storage upload failed for ${objectKey}: ${error.message}`);

  const scratch = path.dirname(localFilePath);
  if (scratch.startsWith(os.tmpdir())) {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  const { data } = getSupabase().storage.from(BUCKET).getPublicUrl(objectKey);
  return data.publicUrl;
}

export type PersistWithFallbackResult = {
  ref: string;
  /** Absolute path on this machine when the bytes live here (local mode or upload fallback). */
  localAbsolutePath: string | null;
  /** Set when Supabase upload failed but the file was kept on this PC. */
  uploadWarning: string | null;
};

/**
 * Video renders: always keep a durable copy under data/channels/…/renders/
 * first. Optionally try Supabase afterwards — failure does NOT lose the file
 * (YouTube/Studio upload can use the local path later).
 */
export async function persistRenderLocalFirst(
  localFilePath: string,
  channelId: string,
  fileName: string
): Promise<PersistWithFallbackResult> {
  const durablePath = durableLocalPath(channelId, "render", fileName);
  if (path.resolve(localFilePath) !== path.resolve(durablePath)) {
    fs.mkdirSync(path.dirname(durablePath), { recursive: true });
    fs.copyFileSync(localFilePath, durablePath);
    // Clean scratch tmp from workingFilePath in remote mode.
    try {
      const tmpDir = path.dirname(localFilePath);
      if (tmpDir.includes(`${path.sep}vmm-render-`) || tmpDir.startsWith(os.tmpdir())) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // best-effort
    }
  }

  const localRef = relativeRefForKind("render", fileName);
  const sizeMb = (fs.statSync(durablePath).size / (1024 * 1024)).toFixed(1);
  const host = os.hostname();

  if (!isRemoteStorageEnabled()) {
    return {
      ref: localRef,
      localAbsolutePath: durablePath,
      uploadWarning: null,
    };
  }

  try {
    const sizeBytes = fs.statSync(durablePath).size;
    // Free Supabase Storage plans often cap ~50 MB; skip cloud upload for large MP4s.
    const maxUploadBytes = Number(process.env.SUPABASE_RENDER_MAX_UPLOAD_MB || 45) * 1024 * 1024;
    if (sizeBytes > maxUploadBytes) {
      return {
        ref: localRef,
        localAbsolutePath: durablePath,
        uploadWarning: `Vídeo ${sizeMb} MB guardado só NESTE PC «${host}» (acima do limite de upload ${Math.round(maxUploadBytes / (1024 * 1024))} MB). Pronto para YouTube local.`,
      };
    }
    const buffer = fs.readFileSync(durablePath);
    const objectKey = `${channelId}/render/${fileName}`;
    const { error } = await getSupabase()
      .storage.from(BUCKET)
      .upload(objectKey, buffer, { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(error.message);
    const { data } = getSupabase().storage.from(BUCKET).getPublicUrl(objectKey);
    // Prefer public URL when cloud upload works, but local file stays on disk.
    return {
      ref: data.publicUrl,
      localAbsolutePath: durablePath,
      uploadWarning: null,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ref: localRef,
      localAbsolutePath: durablePath,
      uploadWarning: `Vídeo guardado só NESTE PC «${host}» (${sizeMb} MB): ${durablePath}. Upload Supabase falhou (${reason}). Sobe depois para Storage ou YouTube.`,
    };
  }
}

/**
 * Prefer Supabase when remote storage is on; if upload fails (size limit, network),
 * keep a durable copy under data/channels/… so the file isn't lost on this machine.
 */
export async function persistFileWithLocalFallback(
  localFilePath: string,
  channelId: string,
  kind: StorageKind,
  fileName: string,
  contentType: string
): Promise<PersistWithFallbackResult> {
  if (!isRemoteStorageEnabled()) {
    const ref = relativeRefForKind(kind, fileName);
    return {
      ref,
      localAbsolutePath: resolveChannelRelativePath(channelId, ref),
      uploadWarning: null,
    };
  }

  try {
    const ref = await persistFile(localFilePath, channelId, kind, fileName, contentType);
    return { ref, localAbsolutePath: null, uploadWarning: null };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const durablePath = durableLocalPath(channelId, kind, fileName);
    fs.copyFileSync(localFilePath, durablePath);
    try {
      const tmpDir = path.dirname(localFilePath);
      if (tmpDir !== path.dirname(durablePath)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // scratch cleanup is best-effort
    }
    const sizeMb = (fs.statSync(durablePath).size / (1024 * 1024)).toFixed(1);
    const host = os.hostname();
    const ref = relativeRefForKind(kind, fileName);
    return {
      ref,
      localAbsolutePath: durablePath,
      uploadWarning: `Upload Supabase falhou (${reason}). O ficheiro (${sizeMb} MB) ficou NESTE PC «${host}» em: ${durablePath}. Noutro PC/Vercel não aparece — copia daqui ou sobe o limite do Storage e regenera.`,
    };
  }
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
