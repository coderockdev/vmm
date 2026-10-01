/**
 * Thumbnail Creative Engine — cover format library for Amor Amor (and
 * channel DNA). Formats are strategies, not rigid templates.
 */

import type { ImageProviderName } from "./ImageProvider";
import type { ThumbnailCandidate } from "./thumbnailStyles";

export type { ThumbnailCandidate, ThumbnailStyleId } from "./thumbnailStyles";
export { THUMBNAIL_STYLE_VARIANTS, stylesForCount, mergeThumbnailHistory } from "./thumbnailStyles";

export interface CoverFormat {
  id: string;
  name: string;
  description: string;
  /** Short visual hint for UI placeholders. */
  previewHint: string;
  structure: string;
  textStrategy: string;
  enabled: boolean;
}

export interface CoverVisualDna {
  styleRules: string;
  avoid: string[];
  accentColors: { primary: string; emphasis: string };
  formats: CoverFormat[];
  /** Recently used format ids (newest last) for anti-repetition. */
  recentFormatIds: string[];
}

export type ThumbnailFormatChoice = string | "auto" | "invent";

export interface InventedCoverFormat {
  newFormatName: string;
  newFormatDescription: string;
  visualStructure: string;
  textStrategy: string;
  whyItFitsThisVideo: string;
}

export interface VideoConcept {
  title: string;
  thumbnailFormatId: ThumbnailFormatChoice;
  thumbnailFormatName: string;
  thumbnailText: string;
  thumbnailScene: string;
  thumbnailEmotion: string;
  thumbnailMessage: string;
  curiosityGap: string;
  titleThumbnailRelation: string;
  inventedFormat?: InventedCoverFormat | null;
  imageProvider?: ImageProviderName | null;
  /** Up to 3 generated variants (YouTube thumbnail slots). */
  candidates?: ThumbnailCandidate[] | null;
  /** Index into candidates that is the primary thumbnail_ref. */
  selectedCandidateIndex?: number | null;
  /** Accumulated past generations (newest last) for the history strip. */
  history?: ThumbnailCandidate[] | null;
  status: "draft" | "ready" | "generated" | "failed";
  errorMessage?: string | null;
  updatedAt?: string;
}

export const AMOR_AMOR_COVER_STYLE_RULES = [
  "YouTube thumbnail 16:9, hyperrealistic photography",
  "Latin American people when faces appear",
  "clear human emotion, cinematic lighting, high contrast",
  "saturated but believable colors",
  "expressive faces when relevant",
  "VERY LARGE text, max mobile readability",
  "ALL letters fully inside the frame with ~8% safe margin — never crop or cut off glyphs",
  "red as recurring accent, yellow as emphasis color",
  "everyday scenes, real-story feeling",
  "composition designed specifically for YouTube thumbnail",
].join(". ");

export const AMOR_AMOR_COVER_AVOID = [
  "illustrations",
  "cartoon aesthetic",
  "plastic AI people",
  "too many elements",
  "deformed hands",
  "deformed phones",
  "tiny text",
  "paragraphs of text",
  "cropped or cut-off letters",
  "text touching or overflowing frame edges",
  "illegible UI chrome",
  "text on a phone screen",
  "the back of a phone drawn as a screen",
  "incoming-call interface",
  "channel name painted on the image",
  "generic stock backgrounds",
  "identical composition across videos",
  "repeating the full video title on the thumbnail",
];

/** The 10 initial Amor Amor creative strategies. */
export const AMOR_AMOR_COVER_FORMATS: CoverFormat[] = [
  {
    id: "01-antes-despues",
    name: "Antes / Después",
    description: "Pantalla dividida: problema a la izquierda, resultado a la derecha.",
    previewHint: "split · flecha",
    structure: "Split screen left=problem right=result. Optional red arrow, red frames, yellow label, lighting shift. A message is a floating chat bubble, never text on a phone screen or on the back of a phone.",
    textStrategy: "Short opposing phrases (e.g. NO RESPONDE → TE EXTRAÑO). Do not use for every video.",
    enabled: true,
  },
  {
    id: "02-mensaje-inesperado",
    name: "Mensaje inesperado",
    description: "Primer plano mirando el celular + gran burbuja de mensaje.",
    previewHint: "phone · bubble",
    structure: "Single scene, character close-up. The story center is a large floating chat bubble with 2–4 real words. The phone is a dark blurred object, never a screen and never the back of the device used as a display.",
    textStrategy: "Bubble text like ¿PODEMOS HABLAR? / TE EXTRAÑO. Overlay text optional and minimal (e.g. DESPUÉS DE 8 MESES…).",
    enabled: true,
  },
  {
    id: "03-momento-emocional",
    name: "Momento emocional",
    description: "Fotograma cinematográfico: rostro + situación + frase corta.",
    previewHint: "face · cinema",
    structure: "Powerful still, no before/after, no required phone. Face + situation carry the story.",
    textStrategy: "2–5 words: NO PUEDO MÁS / LO SOLTÉ / ESA NOCHE…",
    enabled: true,
  },
  {
    id: "04-testimonio",
    name: "Testimonio / Comentario",
    description: "Persona realista + comentario estilo YouTube (sin UI completa).",
    previewHint: "comment · face",
    structure: "Realistic person + authentic-looking comment block; only essential UI cues, not full YouTube chrome.",
    textStrategy: "Header like VOLVÍ PARA CONTARLO + 1 readable comment sentence (can be slightly longer).",
    enabled: true,
  },
  {
    id: "05-frase-imposible",
    name: "Frase imposible",
    description: "Una frase enorme domina; el personaje apoya la emoción.",
    previewHint: "huge text",
    structure: "Giant emotional phrase is the hero; person supports the mood.",
    textStrategy: "1–4 words max impact: VOLVIÓ. / ME ESCRIBIÓ. / 8 MESES DESPUÉS…",
    enabled: true,
  },
  {
    id: "06-misterio-hora",
    name: "Misterio / Hora / Señal",
    description: "Madrugada, coincidencias, sueños, horas — humano, no paranormal barato.",
    previewHint: "3:33 · night",
    structure: "Clock, phone, bedroom, dark kitchen, window, dawn light. Mystery without cheap paranormal aesthetic.",
    textStrategy: "3:33 AM / 7:07 / ESA MISMA NOCHE / DI SU NOMBRE",
    enabled: true,
  },
  {
    id: "07-objeto",
    name: "Objeto protagonista",
    description: "Objeto cuenta la historia; persona desenfocada o parcial.",
    previewHint: "object hero",
    structure: "Phone vibrating, old photo, letter, door, ring, empty chair — object fills most of frame.",
    textStrategy: "VOLVIÓ A SONAR / NO LA BORRÓ / SE ABRIÓ / AHÍ ESTABA SU NOMBRE",
    enabled: true,
  },
  {
    id: "08-dos-personas",
    name: "Dos personas / Distancia",
    description: "Dos lados de la relación; distancia física = emocional.",
    previewHint: "two · distance",
    structure: "Two people separated, back-to-back, different places, door between, or one walking away. Split optional.",
    textStrategy: "ÉL SE ALEJÓ / NO PODÍAN HABLAR / DOS MESES SIN VERSE",
    enabled: true,
  },
  {
    id: "09-resultado-primero",
    name: "Resultado primero",
    description: "Muestra el resultado sorprendente; el título da el contexto.",
    previewHint: "result first",
    structure: "Smile at a message, couple talking again, incoming call, tears of joy — show outcome, not the problem.",
    textStrategy: "FUNCIONÓ. / ME LLAMÓ. / VOLVIÓ A HABLARME. / HOY PASÓ.",
    enabled: true,
  },
  {
    id: "10-pregunta",
    name: "Pregunta emocional",
    description: "Pregunta corta y grande que el espectador siente como propia.",
    previewHint: "question",
    structure: "Emotional character + situation; question is huge and easy to read. Title must not fully answer it.",
    textStrategy: "¿TODAVÍA TE EXTRAÑA? / ¿POR QUÉ NO TE ESCRIBE? / ¿VA A VOLVER?",
    enabled: true,
  },
];

export function defaultAmorAmorCoverDna(): CoverVisualDna {
  return {
    styleRules: AMOR_AMOR_COVER_STYLE_RULES,
    avoid: [...AMOR_AMOR_COVER_AVOID],
    accentColors: { primary: "red", emphasis: "yellow" },
    formats: AMOR_AMOR_COVER_FORMATS.map((f) => ({ ...f })),
    recentFormatIds: [],
  };
}

export function normalizeCoverDna(raw: CoverVisualDna | null | undefined): CoverVisualDna {
  if (!raw) return defaultAmorAmorCoverDna();
  const formats =
    Array.isArray(raw.formats) && raw.formats.length > 0
      ? raw.formats
      : AMOR_AMOR_COVER_FORMATS.map((f) => ({ ...f }));
  return {
    styleRules: raw.styleRules?.trim() || AMOR_AMOR_COVER_STYLE_RULES,
    avoid: Array.isArray(raw.avoid) && raw.avoid.length ? raw.avoid : [...AMOR_AMOR_COVER_AVOID],
    accentColors: {
      primary: raw.accentColors?.primary || "red",
      emphasis: raw.accentColors?.emphasis || "yellow",
    },
    formats,
    recentFormatIds: Array.isArray(raw.recentFormatIds) ? raw.recentFormatIds.slice(-20) : [],
  };
}

export function findCoverFormat(cover: CoverVisualDna, id: string): CoverFormat | undefined {
  return cover.formats.find((f) => f.id === id && f.enabled !== false);
}

/**
 * Pick `count` distinct enabled cover formats, preferring ones least recently used
 * (rotation across the 10 Amor Amor models so auto A/B options stay different).
 */
export function pickRotatingCoverFormats(cover: CoverVisualDna, count: number): CoverFormat[] {
  let enabled = cover.formats.filter((f) => f.enabled !== false);
  // Auto A/B needs 3 distinct formats — if DNA was trimmed, fill from Amor Amor library.
  if (enabled.length < 3) {
    const have = new Set(enabled.map((f) => f.id));
    for (const f of AMOR_AMOR_COVER_FORMATS) {
      if (have.has(f.id)) continue;
      enabled.push({ ...f });
      have.add(f.id);
      if (enabled.length >= 10) break;
    }
  }
  if (enabled.length === 0) return [];
  const n = Math.min(Math.max(1, Math.round(count) || 1), enabled.length, 3);
  const lastSeen = new Map<string, number>();
  cover.recentFormatIds.forEach((id, i) => lastSeen.set(id, i));
  const ranked = [...enabled].sort((a, b) => {
    const ia = lastSeen.has(a.id) ? (lastSeen.get(a.id) as number) : -1000 - enabled.indexOf(a);
    const ib = lastSeen.has(b.id) ? (lastSeen.get(b.id) as number) : -1000 - enabled.indexOf(b);
    if (ia !== ib) return ia - ib;
    return a.id.localeCompare(b.id);
  });
  return ranked.slice(0, n);
}
