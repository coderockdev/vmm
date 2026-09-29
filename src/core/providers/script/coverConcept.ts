import { Channel, Script, VideoProject } from "../../types";
import {
  CoverVisualDna,
  InventedCoverFormat,
  ThumbnailFormatChoice,
  VideoConcept,
  findCoverFormat,
  normalizeCoverDna,
} from "../image/coverFormats";
import { fetchWithRetry, describeProviderError } from "../../httpRetry";
import { UsageSnapshot } from "../../usage/types";

const MODEL = process.env.OPENAI_SCRIPT_MODEL || "gpt-4o";

export interface GenerateCoverConceptArgs {
  channel: Channel;
  project: VideoProject;
  script?: Script | null;
  formatChoice: ThumbnailFormatChoice;
  /** Keep existing title if user edited; otherwise LLM may propose. */
  titleHint?: string | null;
  /** Force reinterpretation with a different format (Probar otro formato). */
  forceDifferentFormat?: boolean;
}

export interface CoverConceptResult {
  concept: VideoConcept;
  usage: UsageSnapshot | null;
}

function coverDna(channel: Channel): CoverVisualDna {
  return normalizeCoverDna(channel.dna.visual?.cover);
}

function formatCatalogBlock(cover: CoverVisualDna): string {
  return cover.formats
    .filter((f) => f.enabled !== false)
    .map(
      (f) =>
        `- ${f.id} | ${f.name}: ${f.description}\n  structure: ${f.structure}\n  text: ${f.textStrategy}`
    )
    .join("\n");
}

function antiRepetitionBlock(cover: CoverVisualDna): string {
  const recent = cover.recentFormatIds.slice(-8);
  if (recent.length === 0) return "No recent formats — any format is fine.";
  const lastTwo = recent.slice(-2);
  return [
    `Recent format ids (oldest→newest): ${recent.join(", ")}`,
    `Do NOT use the same format as the last 2 consecutive if another works: ${lastTwo.join(", ")}.`,
    "Prefer formats not used recently when narratively valid.",
  ].join("\n");
}

function buildPrompt(args: GenerateCoverConceptArgs): string {
  const cover = coverDna(args.channel);
  const scriptExcerpt = (args.script?.rawText ?? "").slice(0, 3500);
  const choice = args.formatChoice;
  const titles = (args.channel.dna.successfulTitles ?? []).slice(0, 25);
  const skill = (args.channel.scriptSkill || args.channel.dna.scriptRules?.generationPrompt || "").slice(0, 1200);
  const mode =
    choice === "auto"
      ? "MODE: AUTOMATIC — pick the best format using the decision rules. If none fits strongly, invent a NEW format."
      : choice === "invent"
        ? "MODE: INVENT — create a genuinely NEW visual structure (not a rename of an existing format). Fill inventedFormat."
        : `MODE: FIXED FORMAT — use format id "${choice}" exactly.`;

  return `You are the Thumbnail Creative Engine for YouTube channel "${args.channel.name}".
Language of outputs (title, thumbnailText, scenes): ${args.channel.dna.language === "es" ? "Spanish" : args.channel.dna.language}.

PRINCIPLE: TITLE + THUMBNAIL are one narrative unit. They must DIALOGUE, not duplicate.
- Thumbnail = curiosity + emotion + conflict (usually 2–6 words).
- Title = context + promise + meaning.
Never put the full title text on the thumbnail.

${mode}
${args.forceDifferentFormat ? "Force a DIFFERENT format than any currently stored on this project." : ""}

CHANNEL COVER DNA
Style: ${cover.styleRules}
Avoid: ${cover.avoid.join("; ")}
Accents: primary=${cover.accentColors.primary}, emphasis=${cover.accentColors.emphasis}
Tone: ${(args.channel.dna.tone ?? []).slice(0, 8).join(", ") || "—"}
Audience: ${args.channel.dna.audience || "—"}

TITLE PATTERNS (successful titles bank — invent NEW titles that rhyme with these patterns, never clone verbatim)
${titles.length ? titles.map((t) => `- ${t}`).join("\n") : "(empty — invent from script + channel voice)"}

CHANNEL SCRIPT / SKILL DNA (use for emotional angle, not to paste on the thumbnail)
"""
${skill || "(none)"}
"""

FORMAT LIBRARY
${formatCatalogBlock(cover)}

AUTO DECISION RULES (when MODE=AUTOMATIC)
1 clear transformation → 01-antes-despues
2 decisive message → 02-mensaje-inesperado
3 powerful emotional still → 03-momento-emocional
4 lived experience / testimony → 04-testimonio
5 one ultra-powerful phrase → 05-frase-imposible
6 hour/signal/dream/mystery → 06-misterio-hora
7 symbolic object → 07-objeto
8 distance between two people → 08-dos-personas
9 surprising outcome first → 09-resultado-primero
10 emotional doubt as question → 10-pregunta
If none is strong → invent.

ANTI-REPETITION
${antiRepetitionBlock(cover)}

VIDEO
Topic: ${args.project.topic}
Current title hint: ${args.titleHint ?? args.project.headline ?? args.project.title}
YouTube headline (if any): ${args.project.headline ?? "—"}
Script excerpt (source of truth for emotion + story beats):
"""
${scriptExcerpt || "(no script yet — use title/topic + successful-title patterns)"}
"""

Fill thumbnailText + thumbnailScene yourself from the script/DNA — the user may leave those fields empty.
thumbnailText rules: 2–5 short punchy words; prefer COMPLETE words that fit large type with margin (never rely on letters at the extreme left/right edge — image models often clip Q, J, g, y).

Return ONLY a JSON object:
{
  "title": string,
  "thumbnailFormatId": string,  // format id, or "invented-<slug>" if inventing
  "thumbnailFormatName": string,
  "thumbnailText": string,
  "thumbnailScene": string,
  "thumbnailEmotion": string,
  "thumbnailMessage": string,
  "curiosityGap": string,
  "titleThumbnailRelation": string,
  "inventedFormat": null | {
    "newFormatName": string,
    "newFormatDescription": string,
    "visualStructure": string,
    "textStrategy": string,
    "whyItFitsThisVideo": string
  }
}`;
}

function parseConcept(text: string, choice: ThumbnailFormatChoice): VideoConcept {
  const json = JSON.parse(text) as Record<string, unknown>;
  const invented = json.inventedFormat as InventedCoverFormat | null | undefined;
  const formatId = String(json.thumbnailFormatId ?? choice);
  return {
    title: String(json.title ?? "").trim() || "Sin título",
    thumbnailFormatId: formatId,
    thumbnailFormatName: String(json.thumbnailFormatName ?? formatId),
    thumbnailText: String(json.thumbnailText ?? "").trim(),
    thumbnailScene: String(json.thumbnailScene ?? "").trim(),
    thumbnailEmotion: String(json.thumbnailEmotion ?? "").trim(),
    thumbnailMessage: String(json.thumbnailMessage ?? "").trim(),
    curiosityGap: String(json.curiosityGap ?? "").trim(),
    titleThumbnailRelation: String(json.titleThumbnailRelation ?? "").trim(),
    inventedFormat: invented && typeof invented === "object" ? invented : null,
    status: "ready",
    errorMessage: null,
    updatedAt: new Date().toISOString(),
  };
}

async function completeJson(prompt: string): Promise<{ text: string; usage: UsageSnapshot }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set — needed to generate title+thumbnail concepts.");
  }
  const response = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 2500,
      temperature: 0.85,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(describeProviderError(`Cover concept (modelo "${MODEL}")`, response.status, body));
  }
  const json = await response.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI returned empty cover concept.");
  const usageRaw = json.usage ?? null;
  return {
    text,
    usage: {
      provider: "openai",
      model: MODEL,
      inputTokens: usageRaw?.prompt_tokens ?? null,
      outputTokens: usageRaw?.completion_tokens ?? null,
      raw: usageRaw,
    },
  };
}

/** Fallback concept when LLM unavailable — still usable for Pollinations. */
function mockConcept(args: GenerateCoverConceptArgs): VideoConcept {
  const cover = coverDna(args.channel);
  const recent = new Set(cover.recentFormatIds.slice(-2));
  let format =
    args.formatChoice !== "auto" && args.formatChoice !== "invent"
      ? findCoverFormat(cover, args.formatChoice)
      : cover.formats.find((f) => f.enabled !== false && !recent.has(f.id)) ?? cover.formats[0];
  if (!format) format = cover.formats[0];
  const title = args.titleHint?.trim() || args.project.title;
  return {
    title,
    thumbnailFormatId: format.id,
    thumbnailFormatName: format.name,
    thumbnailText: "ME ESCRIBIÓ.",
    thumbnailScene: "Mujer latina mirando el celular de noche, luz cálida, emoción contenida.",
    thumbnailEmotion: "esperanza urgente",
    thumbnailMessage: "El resultado aparece antes que el contexto.",
    curiosityGap: "Qué oración hizo antes de recibir el mensaje",
    titleThumbnailRelation: "El título da el contexto; la portada muestra el resultado.",
    inventedFormat: null,
    status: "ready",
    updatedAt: new Date().toISOString(),
  };
}

export async function generateCoverConcept(args: GenerateCoverConceptArgs): Promise<CoverConceptResult> {
  try {
    const { text, usage } = await completeJson(buildPrompt(args));
    const concept = parseConcept(text, args.formatChoice);
    if (args.titleHint?.trim() && !concept.title) concept.title = args.titleHint.trim();
    return { concept, usage };
  } catch (err) {
    if (!process.env.OPENAI_API_KEY) {
      return { concept: mockConcept(args), usage: null };
    }
    throw err;
  }
}

/** Build image model prompt from VIDEO_CONCEPT + DNA (never paste full title as on-image text). */
export function buildThumbnailImagePrompt(args: {
  channel: Channel;
  concept: VideoConcept;
  /** Optional style twist for A/B variants (1–3 images). */
  styleExtra?: string | null;
}): string {
  const cover = coverDna(args.channel);
  const format =
    findCoverFormat(cover, String(args.concept.thumbnailFormatId)) ??
    ({
      name: args.concept.thumbnailFormatName,
      structure: args.concept.inventedFormat?.visualStructure ?? args.concept.thumbnailScene,
      textStrategy: args.concept.inventedFormat?.textStrategy ?? "short text",
    } as const);

  return [
    "YouTube thumbnail, 16:9 landscape, hyperrealistic photography, cinematic.",
    `Channel: ${args.channel.name}.`,
    `Format: ${format.name}. Structure: ${"structure" in format ? format.structure : ""}.`,
    `Scene: ${args.concept.thumbnailScene}.`,
    `Emotion: ${args.concept.thumbnailEmotion}.`,
    `ON-IMAGE TEXT (large, readable on mobile, max ~6 words): "${args.concept.thumbnailText}".`,
    "TEXT LAYOUT (critical): keep ALL letters fully inside a safe margin — at least 8% inset from every edge (left, right, top, bottom). Never crop, clip, or cut off any letter (especially first/last letters like Q, J, g, y). Full glyphs must be visible. Prefer centered or slightly upper text block with padding around it.",
    `Do NOT write this title on the image: "${args.concept.title}".`,
    cover.styleRules,
    `Accent colors: ${cover.accentColors.primary} and ${cover.accentColors.emphasis}.`,
    `Avoid: ${cover.avoid.join(", ")}, cropped text, cut-off letters, text touching frame edges.`,
    args.styleExtra?.trim() || "",
    "No watermarks, no logos, no tiny paragraphs, no deformed hands or phones.",
  ]
    .filter(Boolean)
    .join(" ");
}
