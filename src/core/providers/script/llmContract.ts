import { ContentIdeaDraft, GeneratedScript } from "./ScriptProvider";
import { DEFAULT_WORDS_PER_MINUTE, wordsForDuration } from "../../scriptBudget";

/**
 * Every real (non-mock) ScriptProvider asks its LLM to answer in this same
 * strict JSON shape and parses it through the functions below.
 */
export function contentPlanJsonInstructions(quantity: number): string {
  return [
    ``,
    `FORMATO DE RESPOSTA (responda APENAS com este JSON, sem markdown, sem comentários, sem texto fora do JSON):`,
    `{"ideas":[{"title":"...","angle":"...","objective":"..."}]}`,
    `- Gere exatamente ${quantity} idea(s) distintas.`,
    `- "angle" é o ângulo/abordagem específica desse vídeo dentro do assunto.`,
    `- "objective" é o que o espectador deve sentir ou fazer ao final.`,
  ].join("\n");
}

export function scriptJsonInstructions(opts?: {
  durationMinutes?: number;
  wordsPerMinute?: number;
  /** Channel DNA avoid list — repeated at the end so the model cannot miss it. */
  avoid?: string[];
  openingRule?: string;
}): string {
  const durationMinutes = opts?.durationMinutes;
  const wpm = opts?.wordsPerMinute ?? DEFAULT_WORDS_PER_MINUTE;
  const targetWords =
    durationMinutes && durationMinutes > 0 ? wordsForDuration(durationMinutes, wpm) : null;
  const targetLines =
    durationMinutes && durationMinutes > 0 ? Math.max(12, Math.round(durationMinutes * 10)) : null;
  const avoid = (opts?.avoid ?? []).map((s) => s.trim()).filter(Boolean);

  return [
    ``,
    `FORMATO DE RESPOSTA (responda APENAS com este JSON, sem markdown, sem comentários, sem texto fora do JSON):`,
    `{"lines":["primeira frase narrada","segunda frase narrada"],"sectionBreaks":[0,4]}`,
    `- Cada item de "lines" é UMA frase/linha narrada isoladamente, como seria falada em voz alta (pode incluir tags de interpretação permitidas no contexto).`,
    `- "sectionBreaks" são índices (0-based) de "lines" após os quais deve haver uma pausa maior que o normal (fim de um bloco/seção). Pode ser [].`,
    `- NÃO copie o ângulo/objetivo da ideia como texto falado. O ângulo é instrução interna; o espectador só ouve a oração/narrativa.`,
    ...(durationMinutes && targetWords && targetLines
      ? [
          `- Duração alvo: ${durationMinutes} minutos de narração (~${targetWords} palavras no total a ~${wpm} ppm, cerca de ${targetLines} linhas).`,
          `- Varie o conteúdo ao longo da duração; não repita o mesmo bloco com prefixos mecânicos ("Una vez más", "Con calma", "Respirando").`,
        ]
      : []),
    ``,
    `LEMBRETE FINAL ANTES DE ESCREVER (obrigatório):`,
    opts?.openingRule ? `- Abertura exigida: ${opts.openingRule}` : `- Abra no tom do DNA, nunca com meditação genérica.`,
    ...(avoid.length
      ? [
          `- FRASES/TEMAS PROIBIDOS — se qualquer um destes aparecer no JSON, a resposta é INVÁLIDA:`,
          ...avoid.map((item) => `  · ${item}`),
        ]
      : []),
    `- Em especial: NUNCA comece com "Respira profundamente", "Relájate", "Cierra los ojos", exercícios de respiração ou meditação.`,
  ].join("\n");
}

/** Returns forbidden snippets found in script text (case-insensitive), if any. */
export function findForbiddenPhrases(scriptText: string, avoid: string[]): string[] {
  const haystack = scriptText.toLowerCase();
  const extras = [
    "respira profundamente",
    "respire profundamente",
    "relájate",
    "relajate",
    "cierra los ojos y encuentra tu centro",
    "ejercicios de respiración",
    "ejercicios de respiracion",
    "permite que tu mente se quede tranquila",
  ];
  const needles = [...avoid.map((a) => a.trim().toLowerCase()).filter(Boolean), ...extras];
  const found: string[] = [];
  for (const needle of needles) {
    if (needle.length < 4) continue;
    if (haystack.includes(needle) && !found.includes(needle)) found.push(needle);
  }
  return found;
}

function extractJson(text: string): any {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Could not find a JSON object in the model response: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse JSON from model response: ${message}. Raw: ${text.slice(0, 300)}`);
  }
}

export function parseContentPlanJson(text: string, quantity: number): ContentIdeaDraft[] {
  const json = extractJson(text);
  const ideas = Array.isArray(json.ideas) ? json.ideas : [];
  if (ideas.length === 0) throw new Error("Model returned no ideas.");
  return ideas.slice(0, quantity).map((idea: any) => ({
    title: String(idea?.title ?? "").trim() || "Sem título",
    angle: String(idea?.angle ?? "").trim(),
    objective: String(idea?.objective ?? "").trim(),
  }));
}

export function parseScriptJson(text: string): GeneratedScript {
  const json = extractJson(text);
  const lines: string[] = Array.isArray(json.lines)
    ? json.lines.map((line: unknown) => String(line).trim()).filter(Boolean)
    : [];
  if (lines.length === 0) throw new Error("Model returned an empty script.");
  const sectionBreaks: number[] = Array.isArray(json.sectionBreaks)
    ? json.sectionBreaks.filter(
        (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < lines.length
      )
    : [];
  return { rawText: lines.join("\n\n"), sectionBreaks };
}
