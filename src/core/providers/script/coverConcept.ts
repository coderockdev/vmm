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
import { sampleSuccessfulTitles } from "./ideaSuggestions";

const configuredModel = process.env.OPENAI_SCRIPT_MODEL?.trim() || "";
const MODEL = /mini/i.test(configuredModel) ? configuredModel : "gpt-4o-mini";

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
  if (args.channel.dna.mode === "audiobook" || args.channel.id === "julio-verne-audiolivro") {
    return buildAudiobookCoverPrompt(args, cover);
  }
  const scriptExcerpt = (args.script?.rawText ?? "").slice(0, 3500);
  const choice = args.formatChoice;
  const titles = sampleSuccessfulTitles(args.channel, 25);
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
thumbnailText rules: ONE phrase, 2–4 short words, large type, wide margin. No arrow and no second phrase. Do not repeat those words inside thumbnailScene. The photograph never contains the caption.

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

function buildAudiobookCoverPrompt(args: GenerateCoverConceptArgs, cover: CoverVisualDna): string {
  const scriptExcerpt = (args.script?.rawText ?? "").slice(0, 3500);
  const choice = args.formatChoice;
  const mode =
    choice === "auto"
      ? "MODE: AUTOMATIC — escolhe UM formato da biblioteca, o elemento principal que o capítulo realmente contém."
      : choice === "invent"
        ? "MODE: INVENT — cria um elemento principal novo, ainda dentro do estilo da coleção."
        : `MODE: FIXED FORMAT — usa o formato "${choice}".`;

  return `És o diretor de capas do canal «${args.channel.name}».
Cada vídeo é um capítulo integral de Júlio Verne. A capa ilustra esse capítulo. Não resumes a obra e não inventas um título viral.

${mode}

NORMA DA COLEÇÃO
${cover.styleRules}

Evitar: ${cover.avoid.join("; ")}
Cores de acento: ${cover.accentColors.primary} e ${cover.accentColors.emphasis}

BIBLIOTECA DE ELEMENTOS (escolhe um)
${formatCatalogBlock(cover)}

ANTI-REPETIÇÃO
${antiRepetitionBlock(cover)}

CAPÍTULO
Título editorial (não o mudes): ${args.titleHint ?? args.project.headline ?? args.project.title}
Excerto, fonte do que pode aparecer na imagem:
"""
${scriptExcerpt || "(sem texto — usa só o título editorial, sem inventar a cena)"}
"""

thumbnailText: 2–4 palavras, versão curta do título editorial, em diálogo com a imagem. Exemplos: «O Segredo de Ole Kamp» → «O SEGREDO»; «O Incêndio a Bordo» → «FOGO A BORDO».
thumbnailScene: uma cena que está no excerto. Um elemento principal. Primeiro plano, meio, fundo. Século XIX. Sem o desenlace.
title: repete o título editorial, sem o reescrever.

Devolve só um JSON:
{
  "title": string,
  "thumbnailFormatId": string,
  "thumbnailFormatName": string,
  "thumbnailText": string,
  "thumbnailScene": string,
  "thumbnailEmotion": string,
  "thumbnailMessage": string,
  "curiosityGap": string,
  "titleThumbnailRelation": string,
  "inventedFormat": null
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

async function completeGeminiJson(prompt: string): Promise<{ text: string; usage: UsageSnapshot }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const model = process.env.GEMINI_SCRIPT_MODEL || "gemini-3.8-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${prompt}\n\nResponde SOLO el JSON pedido.` }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(describeProviderError(`Gemini cover (${model})`, response.status, body));
  }
  const json = await response.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty cover concept.");
  const usageRaw = json.usageMetadata ?? null;
  return {
    text,
    usage: {
      provider: "gemini",
      model,
      inputTokens: usageRaw?.promptTokenCount ?? null,
      outputTokens: usageRaw?.candidatesTokenCount ?? null,
      raw: usageRaw,
    },
  };
}

export async function generateCoverConcept(args: GenerateCoverConceptArgs): Promise<CoverConceptResult> {
  const prompt = buildPrompt(args);
  try {
    const { text, usage } = await completeJson(prompt);
    const concept = parseConcept(text, args.formatChoice);
    if (args.titleHint?.trim() && !concept.title) concept.title = args.titleHint.trim();
    return { concept, usage };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const quota = /insufficient_quota|sem créditos|billing_not_active|exceeded your current quota/i.test(msg);
    if (quota && process.env.GEMINI_API_KEY?.trim()) {
      try {
        const { text, usage } = await completeGeminiJson(prompt);
        const concept = parseConcept(text, args.formatChoice);
        if (args.titleHint?.trim() && !concept.title) concept.title = args.titleHint.trim();
        return { concept, usage };
      } catch (geminiErr) {
        console.warn(
          "[cover-concept] Gemini fallback failed:",
          geminiErr instanceof Error ? geminiErr.message : geminiErr
        );
      }
    }
    if (!process.env.OPENAI_API_KEY || quota) {
      console.warn("[cover-concept] using local concept:", msg.slice(0, 160));
      return { concept: mockConcept(args), usage: null };
    }
    throw err;
  }
}

/** Drop caption-painting lines from stored DNA so the photo model is not told to draw words. */
function photographicStyle(styleRules: string): string {
  return styleRules
    .replace(/VERY LARGE text[^.]*(?:\.|$)/gi, "")
    .replace(/ALL letters fully inside[^.]*(?:\.|$)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build image model prompt from VIDEO_CONCEPT + DNA. The caption is composited later, never drawn by the model. */
export function buildThumbnailImagePrompt(args: {
  channel: Channel;
  concept: VideoConcept;
  /** Optional style twist for A/B variants (1–3 images). */
  styleExtra?: string | null;
}): string {
  const cover = coverDna(args.channel);
  if (args.channel.dna.mode === "audiobook" || args.channel.id === "julio-verne-audiolivro") {
    return buildAudiobookImagePrompt(args, cover);
  }
  const format =
    findCoverFormat(cover, String(args.concept.thumbnailFormatId)) ??
    ({
      name: args.concept.thumbnailFormatName,
      structure: args.concept.inventedFormat?.visualStructure ?? args.concept.thumbnailScene,
      textStrategy: args.concept.inventedFormat?.textStrategy ?? "short text",
    } as const);

  const scene = (args.concept.thumbnailScene ?? "")
    .replace(/"[^"]*"/g, "")
    .replace(/«[^»]*»/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return [
    "YouTube thumbnail photograph, 16:9 landscape, hyperrealistic, cinematic.",
    "CAST: the only face is a woman. One look for the whole frame, including both sides of a split — the same woman. Either an older Andean woman (indigenous Andean features, silver hair, lined face, dignified, everyday clothes) or a young attractive Latin American woman (contemporary, clear face). Never a man. No male face.",
    "ABSOLUTE: the photograph contains zero letters, zero numbers, zero logos, zero captions, zero subtitles, zero speech-bubble text, zero UI. A caption is composited afterwards. If any glyph appears, the image is wrong.",
    "PHONE: if a phone is in frame it is a matte dark object, screen OFF and solid black. No lock screen, no incoming call, no caller name, no icons, no writing. An analog clock with no numerals is allowed only when the format requires a clock.",
    "LIGHT: frontal key light on the face. Catchlight in both eyes. Skin and expression are the brightest part of the frame. A window may rim the hair, but it is never the only light. A face in silhouette or lost in shadow is a failed image.",
    "COMPOSITION: her face fills the right half, eyes and mouth fully visible. The format's signature object sits upper-left, large and unmistakable. The lower-left stays darker and empty for a caption.",
    "QUALITY: this must read as a finished YouTube thumbnail, not a moody still. One clear object from the format, a lit face, and one red or yellow accent. A generic portrait that ignores the format is a failed image.",
    `Channel mood: ${args.channel.name}.`,
    `Format: ${format.name}. Structure: ${"structure" in format ? format.structure : ""}.`,
    scene ? `Scene (photograph only, no writing): ${scene}.` : "",
    args.concept.thumbnailEmotion ? `Emotion: ${args.concept.thumbnailEmotion}.` : "",
    photographicStyle(cover.styleRules),
    `Accent colors in the scene: ${cover.accentColors.primary} and ${cover.accentColors.emphasis}.`,
    `Avoid: ${cover.avoid.join(", ")}.`,
    args.styleExtra?.trim() || "",
    "FINAL: no words anywhere in the image. No phone interface. Face brightly lit. The format's signature object is visible.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildAudiobookImagePrompt(
  args: { channel: Channel; concept: VideoConcept; styleExtra?: string | null },
  cover: CoverVisualDna
): string {
  const format =
    findCoverFormat(cover, String(args.concept.thumbnailFormatId)) ??
    ({
      name: args.concept.thumbnailFormatName,
      structure: args.concept.inventedFormat?.visualStructure ?? args.concept.thumbnailScene,
    } as const);
  const scene = (args.concept.thumbnailScene ?? "").replace(/\s+/g, " ").trim();
  const words = (args.concept.thumbnailText ?? "").replace(/\s+/g, " ").trim();

  return [
    "Capa de YouTube 16:9 para um audiolivro de Júlio Verne. Ilustração, não fotografia.",
    cover.styleRules,
    `Elemento principal: ${format.name}. ${"structure" in format ? format.structure : ""}`,
    scene ? `Cena deste capítulo, sem inventar factos e sem mostrar o final: ${scene}` : "",
    words
      ? `Texto grande, 2–4 palavras, letras corretas, dentro de uma margem de 12%: «${words}».`
      : "",
    "Por baixo, discreto e mais pequeno: «JÚLIO VERNE». Nenhum outro texto.",
    `Cores de acento: ${cover.accentColors.primary} e ${cover.accentColors.emphasis}.`,
    `Evitar: ${cover.avoid.join(", ")}.`,
    args.styleExtra?.trim() || "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
