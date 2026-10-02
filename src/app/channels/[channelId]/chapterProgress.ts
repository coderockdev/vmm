import type { Chapter } from "../../../core/types";

export const CHAPTER_STEPS = ["Áudio", "Imagens", "Vídeo", "Portada", "Descrição", "YouTube"] as const;

const ACTIVE = new Set(["tts_running", "images_ready", "video_ready", "thumb_ready", "uploading"]);

export function chapterSnap(c: Chapter) {
  const queued =
    c.status === "tts_running" && !c.audioPath && /^Na fila:/i.test(c.errorMessage || "");
  const message = c.errorMessage || "";
  const joiningVideo = /^Vídeo: a juntar/i.test(message);
  const version = Math.max(1, c.attempts || 1);
  const redoing = !queued && ACTIVE.has(c.status) && (version > 1 || Boolean(c.youtubeVideoId));

  let step = -1;
  if (!redoing && (c.youtubeVideoId || c.status === "published" || c.status === "uploaded" || c.status === "scheduled")) {
    step = 5;
  } else if (c.status === "uploading") step = 4;
  else if (c.thumbPath || c.status === "thumb_ready") step = 3;
  else if (c.videoPath || c.status === "video_ready" || joiningVideo) step = 2;
  else if (c.status === "images_ready" || /^Imagens:|^Animação:/i.test(message)) step = 1;
  else if (c.audioPath || c.status === "audio_ready" || (c.status === "tts_running" && !queued)) step = 0;

  const done = !redoing && Boolean(c.youtubeVideoId || c.status === "published");
  const failed = c.status === "failed";
  const working = redoing || (!queued && ACTIVE.has(c.status));
  const percent = done ? 100 : step < 0 ? 0 : Math.round(((step + (working ? 0.45 : 1)) / CHAPTER_STEPS.length) * 100);
  const live =
    c.errorMessage || (step < 0 ? "Pendente" : working ? `${CHAPTER_STEPS[step]} em curso` : CHAPTER_STEPS[step]);
  const stage = failed
    ? c.errorMessage || "Parou"
    : done
      ? version > 1
        ? `Versão ${version} no YouTube`
        : "No YouTube"
      : queued
        ? "Na fila. Áudio ainda não começou."
        : redoing
          ? `Versão ${version} · a gerar de novo. ${live}`
          : live;
  const kind = done ? "done" : failed ? "failed" : working ? "working" : "idle";
  return { percent, stage, kind, step, version, redoing };
}
