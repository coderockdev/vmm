import type { Chapter } from "../../../core/types";
import {
  CHAPTER_PARTS,
  freshLog,
  humanMessage,
  overallPercent,
  readLog,
  type ChapterPart,
} from "../../../core/audiobook/chapterLog";

export const CHAPTER_STEPS = CHAPTER_PARTS.map((part) => part.label);

const ACTIVE = new Set(["tts_running", "images_ready", "video_ready", "thumb_ready", "uploading"]);

export function chapterSnap(c: Chapter) {
  const human = humanMessage(c.errorMessage);
  const queued = c.status === "tts_running" && /^Na fila:/i.test(human);
  const stored = readLog(c.errorMessage);
  const version = Math.max(1, c.attempts || 1);
  const redoing = !queued && ACTIVE.has(c.status) && (version > 1 || Boolean(c.youtubeVideoId));
  const failed = c.status === "failed";
  const done = !redoing && !queued && Boolean(c.youtubeVideoId || c.status === "published");

  const parts = placeAssembly(stored ?? partsFromStatus(c, human, queued, redoing, done, failed));
  const percent = queued ? 0 : done ? 100 : overallPercent(parts);
  const running = parts.find((part) => part.startedAt && !part.finishedAt);
  const step = running ? CHAPTER_PARTS.findIndex((part) => part.id === running.id) : parts.filter((part) => part.percent >= 100).length - 1;
  const live = running ? `${running.label}: ${running.detail}` : human || (step < 0 ? "Pendente" : "Em curso");
  const working = Boolean(running) || (!queued && !done && !failed && ACTIVE.has(c.status));
  const stage = failed
    ? human || "Parou"
    : done
      ? version > 1
        ? `Versão ${version} no YouTube`
        : "No YouTube"
      : queued
        ? human
        : redoing
          ? `Versão ${version}. ${live}`
          : live;
  const kind = done ? "done" : failed ? "failed" : working || queued ? "working" : "idle";
  return { percent, stage, kind, step, version, redoing, parts, queued };
}

function partsFromStatus(
  c: Chapter,
  human: string,
  queued: boolean,
  redoing: boolean,
  done: boolean,
  failed: boolean
): ChapterPart[] {
  const parts = freshLog();
  if (queued) {
    parts[0] = { ...parts[0], detail: `Na fila desde ${clock(c.updatedAt)}` };
    return parts;
  }
  let active = 0;
  if (done || c.youtubeVideoId) active = CHAPTER_PARTS.length;
  else if (/^YouTube:/i.test(human) || c.status === "uploading") active = 6;
  else if (/descrição/i.test(human)) active = 5;
  else if (/^Portada:/i.test(human) || c.status === "thumb_ready") active = 4;
  else if (/^Renderização:/i.test(human)) active = 3;
  else if (c.status === "video_ready" || c.videoPath) active = 4;
  else if (/^Animação:|^Vídeo:/i.test(human)) active = 2;
  else if (/^Imagens:/i.test(human) || c.status === "images_ready") active = 1;
  else if (redoing || /^Áudio:/i.test(human) || c.status === "tts_running" || c.status === "audio_ready") active = 0;
  else if (!redoing && (c.thumbPath || c.audioPath)) {
    active = c.thumbPath ? 5 : 1;
  }
  return parts.map((part, index) => {
    if (done || index < active) {
      return { ...part, percent: 100, detail: "Pronto", startedAt: c.updatedAt, finishedAt: c.updatedAt };
    }
    if (index === active && (failed || human)) {
      return {
        ...part,
        percent: failed ? part.percent : 45,
        detail: human || part.detail,
        startedAt: c.updatedAt,
        finishedAt: failed ? c.updatedAt : null,
      };
    }
    return part;
  });
}

export function partClock(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function clock(iso: string): string {
  return partClock(iso);
}

/** Older runs wrote the assembly on Animação. Show that line on Renderização. */
function placeAssembly(parts: ChapterPart[]): ChapterPart[] {
  const video = parts.find((part) => part.id === "video");
  const render = parts.find((part) => part.id === "render");
  if (!video?.startedAt || !render || render.startedAt) return parts;
  if (!/juntar|fade|narra|música|mont/i.test(`${video.detail}`)) return parts;
  return parts.map((part) => {
    if (part.id === "video") {
      return { ...part, percent: 100, detail: "Clipes prontos", finishedAt: video.startedAt };
    }
    if (part.id === "render") {
      return {
        ...part,
        percent: video.percent,
        detail: video.detail,
        startedAt: video.startedAt,
        finishedAt: video.finishedAt,
      };
    }
    return part;
  });
}
