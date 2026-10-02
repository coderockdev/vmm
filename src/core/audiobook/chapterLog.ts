export const CHAPTER_PARTS = [
  { id: "audio", label: "Áudio", weight: 15 },
  { id: "images", label: "Imagens", weight: 25 },
  { id: "video", label: "Vídeo", weight: 35 },
  { id: "cover", label: "Portada", weight: 10 },
  { id: "copy", label: "Descrição", weight: 5 },
  { id: "youtube", label: "YouTube", weight: 10 },
] as const;

export type ChapterPartId = (typeof CHAPTER_PARTS)[number]["id"];

export type ChapterPart = {
  id: ChapterPartId;
  label: string;
  percent: number;
  detail: string;
  startedAt: string | null;
  finishedAt: string | null;
};

const MARK = "\n@@log@@";
const ORDER = CHAPTER_PARTS.map((part) => part.id);

export function freshLog(): ChapterPart[] {
  return CHAPTER_PARTS.map((part) => ({
    id: part.id,
    label: part.label,
    percent: 0,
    detail: "À espera",
    startedAt: null,
    finishedAt: null,
  }));
}

export function humanMessage(raw: string | null | undefined): string {
  const text = raw || "";
  const at = text.indexOf(MARK);
  return (at < 0 ? text : text.slice(0, at)).trim();
}

export function readLog(raw: string | null | undefined): ChapterPart[] | null {
  const text = raw || "";
  const at = text.indexOf(MARK);
  if (at < 0) return null;
  try {
    const parsed = JSON.parse(text.slice(at + MARK.length)) as ChapterPart[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const byId = new Map(parsed.map((part) => [part.id, part]));
    return freshLog().map((blank) => {
      const saved = byId.get(blank.id);
      if (!saved) return blank;
      return {
        ...blank,
        percent: Number(saved.percent) || 0,
        detail: saved.detail || blank.detail,
        startedAt: saved.startedAt ?? null,
        finishedAt: saved.finishedAt ?? null,
      };
    });
  } catch {
    return null;
  }
}

export function packMessage(human: string, log: ChapterPart[]): string {
  return `${human}${MARK}${JSON.stringify(log)}`;
}

export function markPart(
  log: ChapterPart[],
  id: ChapterPartId,
  update: { percent: number; detail: string; done?: boolean }
): ChapterPart[] {
  const now = new Date().toISOString();
  const index = ORDER.indexOf(id);
  return log.map((part) => {
    const order = ORDER.indexOf(part.id);
    if (order < index && part.startedAt && !part.finishedAt) {
      return { ...part, percent: 100, finishedAt: now, detail: part.detail === "À espera" ? "Pronto" : part.detail };
    }
    if (part.id !== id) return part;
    const done = Boolean(update.done) || update.percent >= 100;
    return {
      ...part,
      percent: done ? 100 : Math.max(0, Math.min(99, Math.round(update.percent))),
      detail: update.detail,
      startedAt: part.startedAt ?? now,
      finishedAt: done ? part.finishedAt ?? now : null,
    };
  });
}

export function overallPercent(parts: ChapterPart[]): number {
  const total = CHAPTER_PARTS.reduce((sum, spec) => {
    const part = parts.find((item) => item.id === spec.id);
    return sum + spec.weight * ((part?.percent ?? 0) / 100);
  }, 0);
  return Math.round(total);
}
