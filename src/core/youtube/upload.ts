import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { DATA_ROOT, ensureDir } from "../paths";
import { getYoutubeClientForChannel } from "./client";
import { mapYoutubeApiError, YoutubeAuthError, YoutubeQuotaError } from "./oauth";

export type ResumableSession = {
  uploadId: string;
  channelId: string;
  sessionUri: string;
  title: string;
  description: string;
  contentType: string;
  contentLength: number;
  bytesReceived: number;
  videoId: string | null;
  createdAt: string;
};

function sessionsDir(): string {
  return ensureDir(path.join(DATA_ROOT, "tmp", "youtube-uploads"));
}

function sessionPath(uploadId: string): string {
  return path.join(sessionsDir(), `${uploadId}.json`);
}

export function loadSession(uploadId: string): ResumableSession | null {
  const p = sessionPath(uploadId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as ResumableSession;
  } catch {
    return null;
  }
}

function saveSession(session: ResumableSession): void {
  fs.writeFileSync(sessionPath(session.uploadId), JSON.stringify(session, null, 2));
}

export function sanitizeYoutubeTitle(raw: string): string {
  const cleaned = raw.replace(/[<>]/g, "").trim();
  return cleaned.slice(0, 100) || "Sem título";
}

export function sanitizeYoutubeDescription(raw: string): string {
  // YouTube limit ~5000 bytes; keep a safe UTF-8 budget.
  const buf = Buffer.from(raw ?? "", "utf8");
  if (buf.length <= 5000) return raw ?? "";
  return buf.subarray(0, 5000).toString("utf8").replace(/\uFFFD$/, "");
}

/**
 * Start a YouTube resumable upload session (videos.insert, private only).
 * No category / tags / public / madeForKids — those stay manual in Studio.
 */
export async function startResumableVideoUpload(args: {
  channelId: string;
  title: string;
  description: string;
  contentType: string;
  contentLength: number;
}): Promise<ResumableSession> {
  const title = sanitizeYoutubeTitle(args.title);
  const description = sanitizeYoutubeDescription(args.description);
  const contentType = args.contentType || "video/mp4";

  if (!args.contentLength || args.contentLength < 1) {
    throw new Error("contentLength inválido");
  }

  const { oauth2 } = await getYoutubeClientForChannel(args.channelId);
  const token = (await oauth2.getAccessToken()).token;
  if (!token) throw new YoutubeAuthError("Sem access token. Volta a «Conectar YouTube».");

  const metadata = {
    snippet: { title, description },
    status: { privacyStatus: "private" },
  };

  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": contentType,
        "X-Upload-Content-Length": String(args.contentLength),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    const body = (await initRes.json().catch(() => ({}))) as {
      error?: { message?: string; errors?: Array<{ reason?: string }> };
    };
    const reason = body.error?.errors?.[0]?.reason || "";
    if (reason === "quotaExceeded") throw new YoutubeQuotaError();
    if (initRes.status === 401) {
      throw new YoutubeAuthError("Token YouTube inválido. Volta a «Conectar YouTube».");
    }
    throw new Error(body.error?.message || `Falha ao iniciar upload (${initRes.status})`);
  }

  const sessionUri = initRes.headers.get("location");
  if (!sessionUri) throw new Error("YouTube não devolveu Location da sessão resumable");

  const session: ResumableSession = {
    uploadId: randomUUID(),
    channelId: args.channelId,
    sessionUri,
    title,
    description,
    contentType,
    contentLength: args.contentLength,
    bytesReceived: 0,
    videoId: null,
    createdAt: new Date().toISOString(),
  };
  saveSession(session);
  return session;
}

/**
 * Query how many bytes YouTube already has (for resume after interrupt).
 */
export async function queryResumableStatus(session: ResumableSession): Promise<number> {
  const { oauth2 } = await getYoutubeClientForChannel(session.channelId);
  const token = (await oauth2.getAccessToken()).token;
  if (!token) throw new YoutubeAuthError("Sem access token. Volta a «Conectar YouTube».");

  const res = await fetch(session.sessionUri, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Length": "0",
      "Content-Range": `bytes */${session.contentLength}`,
    },
  });

  if (res.status === 308) {
    const range = res.headers.get("range"); // e.g. bytes=0-12345
    if (!range) return 0;
    const m = /bytes=0-(\d+)/.exec(range);
    return m ? Number(m[1]) + 1 : 0;
  }
  if (res.ok) {
    // Already complete — parse video id if present
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    if (data.id) {
      session.videoId = data.id;
      session.bytesReceived = session.contentLength;
      saveSession(session);
    }
    return session.contentLength;
  }
  if (res.status === 401) {
    throw new YoutubeAuthError("Token YouTube inválido. Volta a «Conectar YouTube».");
  }
  const body = await res.text().catch(() => "");
  if (/quota/i.test(body)) throw new YoutubeQuotaError();
  throw new Error(`Estado da sessão resumable: HTTP ${res.status} ${body.slice(0, 200)}`);
}

/**
 * PUT a byte range into an existing resumable session (streaming body).
 */
export async function putResumableChunk(args: {
  uploadId: string;
  channelId: string;
  start: number;
  end: number; // inclusive
  total: number;
  body: Buffer;
}): Promise<{ done: boolean; videoId: string | null; bytesReceived: number }> {
  const session = loadSession(args.uploadId);
  if (!session || session.channelId !== args.channelId) {
    throw new Error("Sessão de upload não encontrada (expirou ou ID inválido).");
  }
  if (args.total !== session.contentLength) {
    throw new Error("contentLength não coincide com a sessão.");
  }

  const { oauth2 } = await getYoutubeClientForChannel(session.channelId);
  const token = (await oauth2.getAccessToken()).token;
  if (!token) throw new YoutubeAuthError("Sem access token. Volta a «Conectar YouTube».");

  const res = await fetch(session.sessionUri, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": session.contentType,
      "Content-Length": String(args.body.length),
      "Content-Range": `bytes ${args.start}-${args.end}/${args.total}`,
    },
    body: new Uint8Array(args.body),
  });

  if (res.status === 308) {
    const range = res.headers.get("range");
    let received = args.end + 1;
    if (range) {
      const m = /bytes=0-(\d+)/.exec(range);
      if (m) received = Number(m[1]) + 1;
    }
    session.bytesReceived = received;
    saveSession(session);
    return { done: false, videoId: null, bytesReceived: received };
  }

  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    const videoId = data.id ?? null;
    session.bytesReceived = args.total;
    session.videoId = videoId;
    saveSession(session);
    return { done: true, videoId, bytesReceived: args.total };
  }

  const text = await res.text().catch(() => "");
  if (res.status === 401 || /invalid_grant/i.test(text)) {
    throw new YoutubeAuthError("Token YouTube inválido. Volta a «Conectar YouTube».");
  }
  if (res.status === 403 && /quota/i.test(text)) throw new YoutubeQuotaError();
  throw new Error(`Chunk falhou HTTP ${res.status}: ${text.slice(0, 300)}`);
}

const THUMB_MAX_BYTES = 2 * 1024 * 1024;

export function validateThumbnailFile(args: {
  buffer: Buffer;
  mimeType: string;
}): void {
  const okType = ["image/jpeg", "image/jpg", "image/png"].includes(args.mimeType.toLowerCase());
  if (!okType) {
    throw new Error("Capa: só JPG ou PNG.");
  }
  if (args.buffer.length > THUMB_MAX_BYTES) {
    throw new Error("Capa: máximo 2 MB.");
  }
  if (args.buffer.length < 100) {
    throw new Error("Capa: ficheiro inválido ou vazio.");
  }
}

/**
 * Set custom thumbnail. Failures are non-fatal for the video itself.
 */
export async function setVideoThumbnail(args: {
  channelId: string;
  videoId: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<void> {
  validateThumbnailFile({ buffer: args.buffer, mimeType: args.mimeType });

  try {
    const { youtube } = await getYoutubeClientForChannel(args.channelId);
    const { Readable } = await import("stream");
    const stream = Readable.from(args.buffer);
    await youtube.thumbnails.set({
      videoId: args.videoId,
      media: {
        mimeType: args.mimeType === "image/png" ? "image/png" : "image/jpeg",
        body: stream,
      },
    });
  } catch (err) {
    throw mapYoutubeApiError(err);
  }
}

export function studioEditUrl(videoId: string): string {
  return `https://studio.youtube.com/video/${videoId}/edit`;
}
