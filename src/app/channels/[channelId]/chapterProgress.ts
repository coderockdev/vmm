import type { Chapter } from "../../../core/types";

export const CHAPTER_STEPS = ["Áudio", "Vídeo", "Portada", "Descrição", "YouTube"] as const;

export function chapterSnap(c: Chapter) {
  let step = -1;
  if (c.youtubeVideoId || c.status === "published" || c.status === "uploaded" || c.status === "scheduled") {
    step = 4;
  } else if (c.status === "uploading") step = 3;
  else if (c.thumbPath || c.status === "thumb_ready") step = 2;
  else if (c.videoPath || c.status === "video_ready" || c.status === "images_ready") step = 1;
  else if (c.audioPath || c.status === "audio_ready" || c.status === "tts_running") step = 0;

  const done = Boolean(c.youtubeVideoId || c.status === "published");
  const failed = c.status === "failed";
  const working = c.status === "tts_running" || c.status === "uploading";
  const percent = done ? 100 : step < 0 ? 0 : Math.round(((step + (working ? 0.45 : 1)) / CHAPTER_STEPS.length) * 100);
  const stage = failed
    ? c.errorMessage || "Parou"
    : done
      ? "No YouTube"
      : c.errorMessage || (step < 0 ? "Pendente" : CHAPTER_STEPS[step]);
  const kind = done ? "done" : failed ? "failed" : working ? "working" : "idle";
  return { percent, stage, kind, step };
}
