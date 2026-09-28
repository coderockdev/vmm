import { AMOR_AMOR_ALLOWED_TAGS } from "./voiceCapabilities";

export interface PerformanceTagDef {
  markup: string;
  label: string;
  hint: string;
}

const LABELS: Record<string, { label: string; hint: string }> = {
  "[softly]": { label: "Suave", hint: "Tom baixo" },
  "[sighs]": { label: "Suspiro", hint: "Suspirar" },
  "[whispers]": { label: "Sussurro", hint: "Mais baixo, íntimo" },
  "[warmly]": { label: "Caloroso", hint: "Acolhedor" },
  "[excited]": { label: "Animado", hint: "Expectativa" },
  "[sad]": { label: "Triste", hint: "Dor" },
  "[thoughtfully]": { label: "Reflexivo", hint: "Pausa mental" },
  "[exhales]": { label: "Exala", hint: "Soltar o ar" },
  "[emotional]": { label: "Emocional", hint: "Carga afetiva" },
  "[pause]": { label: "Pausa", hint: "Silêncio" },
  "[tenderly]": { label: "Terno", hint: "Carinho" },
  "[hopeful]": { label: "Esperançoso", hint: "Alívio" },
  "[laughs softly]": { label: "Risada suave", hint: "Leve" },
};

export const PERFORMANCE_TAG_CATALOG: PerformanceTagDef[] = AMOR_AMOR_ALLOWED_TAGS.map((markup) => ({
  markup,
  label: LABELS[markup]?.label ?? markup,
  hint: LABELS[markup]?.hint ?? "",
}));

export function catalogForProvider(_provider: string): PerformanceTagDef[] {
  return PERFORMANCE_TAG_CATALOG;
}
