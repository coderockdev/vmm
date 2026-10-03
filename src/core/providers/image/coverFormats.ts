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
  "The only face is a woman. One look for the whole image, including both sides of a split: either an older Andean woman (indigenous Andean features, silver hair, lined face, dignified, everyday clothes, not a costume) or a young attractive Latin American woman (contemporary, clear face, the person a viewer stops for). Never a man. No male face",
  "clear human emotion, cinematic lighting, high contrast",
  "saturated but believable colors",
  "expressive faces when relevant",
  "The photograph itself has zero letters. A short caption is composited afterwards, fully inside a wide margin",
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
  "men as the subject",
  "male faces",
  "cropped or cut-off letters",
  "text touching or overflowing frame edges",
  "words, labels, or captions painted inside the photograph",
  "the same phrase repeated in a bubble and again as a caption",
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
    structure: "Split screen of the same woman: left is the problem, right is the result. A clear red arrow points from the problem to the result, plus a thin red divider. No words, no labels, no speech bubble.",
    textStrategy: "One short phrase for the whole thumbnail, 2–4 words. The split shows the change. Do not write a second phrase.",
    enabled: true,
  },
  {
    id: "02-mensaje-inesperado",
    name: "Mensaje inesperado",
    description: "Primer plano mirando el celular + gran burbuja de mensaje.",
    previewHint: "phone · bubble",
    structure: "Single scene, woman close-up, looking at a dark phone. An empty chat-bubble shape may float beside her, with no letters inside. The phone screen is off.",
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
    structure: "REQUIRED signature: a large analog clock with no numerals and no digits, hands only, upper left. She is by a window at night. Face front-lit and bright, never a silhouette. A red clock hand is the accent. No painted numbers.",
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

/** Cover norm for Júlio Verne em Audiolivro. The image model follows this text. */
export const JULIO_VERNE_COVER_STYLE_RULES = `CRIAR CAPA DE YOUTUBE — JÚLIO VERNE

Criar uma capa 16:9 para um audiobook de Júlio Verne.

ESTILO VISUAL:
Ilustração clássica europeia de aventura, inspirada na tradição franco-belga dos álbuns de aventuras do século XX, com linhas limpas, desenho preciso, composição gráfica forte e cores sólidas, evocando a linguagem visual de Hergé e da escola de quadrinhos europeia, sem copiar personagens ou ilustrações existentes.

A imagem deve parecer uma ilustração de um grande livro de aventuras.

Não fazer:
- fotografia;
- fotorealismo;
- 3D;
- anime;
- pintura excessivamente detalhada;
- textura hiper-realista;
- excesso de pequenos detalhes;
- aparência de imagem gerada por IA.

PRINCÍPIOS VISUAIS:
- contornos claros e controlados;
- formas simplificadas;
- cores vibrantes porém elegantes;
- sombras simples;
- perspectiva cinematográfica;
- composição fácil de entender em tamanho pequeno;
- personagens com silhuetas claras;
- paisagens grandiosas;
- sensação de movimento e descoberta;
- atmosfera de aventura;
- aparência de ilustração impressa;
- visual atemporal.

A imagem deve transmitir: AVENTURA + MISTÉRIO + DESCOBERTA.

COMPOSIÇÃO:
Criar uma cena visualmente forte baseada diretamente no capítulo.

Escolher UM elemento principal: personagem, veículo, navio, balão, montanha, ilha, cidade, objeto misterioso, perigo, descoberta ou paisagem extraordinária. Esse elemento deve dominar a composição.

Criar profundidade: primeiro plano → ação/personagem principal; meio → elemento narrativo; fundo → ambiente grandioso. Não colocar tudo na mesma escala.

PERSONAGENS:
Personagens do século XIX, roupas historicamente coerentes com a história. Em ação ou observando algo. Evitar retratos posados. Preferir: olhando para o horizonte, apontando, correndo, navegando, explorando, descobrindo, enfrentando um perigo.

THUMBNAIL:
A capa contém o título editorial do capítulo numa versão curta de 2–4 palavras, grande, forte, legível no celular, estética de título de aventura clássica. O texto dialoga com a imagem.
Exemplos: "O Segredo de Ole Kamp" → "O SEGREDO"; "O Incêndio a Bordo" → "FOGO A BORDO".
Adicionar discretamente "JÚLIO VERNE" em tamanho menor. O título principal é o elemento textual dominante. Nenhum outro texto.

NÃO colocar: número do capítulo, descrição, "audiobook", "história completa", YouTube, logos modernos, chamadas promocionais. A capa parece uma capa de aventura, não um anúncio.

CORES:
Paleta coerente com a obra e com a cena. Cores fortes e claras: azul profundo, vermelho, ocre, amarelo, verde, creme, marrom. Evitar excesso de cinza e aparência sombria quando a história não exigir.

CONSISTÊNCIA:
Todas as capas da biblioteca pertencem à mesma coleção. Não são clones: composição, ação, elemento principal e enquadramento mudam. A identidade comum é o estilo de ilustração, a linha, a cor, a tipografia e o acabamento.

A cena baseia-se no conteúdo REAL do capítulo. Não inventar acontecimentos. Não revelar o final. Curiosidade sem spoiler.

RESULTADO:
Ilustração de aventura clássica europeia, limpa, colorida, expressiva e cinematográfica, com aparência de um álbum de aventuras do século XX, no universo de Júlio Verne. 16:9.`;

export const JULIO_VERNE_COVER_AVOID = [
  "fotografia",
  "fotorealismo",
  "3D",
  "anime",
  "pintura hiperdetalhada",
  "textura hiper-realista",
  "excesso de detalhes pequenos",
  "aparência de imagem gerada por IA",
  "retrato posado",
  "número do capítulo",
  "a palavra audiobook",
  "história completa",
  "logos modernos",
  "chamadas promocionais",
  "spoiler do final do capítulo",
  "acontecimentos que não estão no capítulo",
];

export const JULIO_VERNE_COVER_FORMATS: CoverFormat[] = [
  {
    id: "vn-personagem",
    name: "Personagem em ação",
    description: "Uma figura do século XIX domina a capa, em ação ou a descobrir algo.",
    previewHint: "figura · ação",
    structure: "Um personagem em primeiro plano, em ação. Meio: o que ele enfrenta ou descobre. Fundo: paisagem grandiosa. Um só elemento principal.",
    textStrategy: "2–4 palavras tiradas do título editorial, grandes. «JÚLIO VERNE» pequeno.",
    enabled: true,
  },
  {
    id: "vn-navio",
    name: "Navio",
    description: "O navio é o herói da composição.",
    previewHint: "navio",
    structure: "Navio a dominar o quadro, com mar ou costa em profundidade. Tripulação pequena, em ação, nunca um retrato posado.",
    textStrategy: "2–4 palavras tiradas do título editorial, grandes. «JÚLIO VERNE» pequeno.",
    enabled: true,
  },
  {
    id: "vn-balao",
    name: "Balão",
    description: "O balão ou outro veículo aéreo ocupa o quadro.",
    previewHint: "balão",
    structure: "Balão grande, céu e terra lá em baixo. Sensação de partida ou de perigo, sem spoiler do desenlace.",
    textStrategy: "2–4 palavras tiradas do título editorial, grandes. «JÚLIO VERNE» pequeno.",
    enabled: true,
  },
  {
    id: "vn-veiculo",
    name: "Veículo",
    description: "Um veículo da história (comboio, trenó, submarino, carruagem) é o elemento principal.",
    previewHint: "veículo",
    structure: "O veículo em grande escala, em movimento. Personagens pequenos a operá-lo. Fundo grandioso.",
    textStrategy: "2–4 palavras tiradas do título editorial, grandes. «JÚLIO VERNE» pequeno.",
    enabled: true,
  },
  {
    id: "vn-paisagem",
    name: "Paisagem extraordinária",
    description: "Montanha, ilha, gruta ou horizonte dominam.",
    previewHint: "paisagem",
    structure: "Paisagem enorme. Figuras pequenas a explorá-la, para dar escala. Um só motivo principal.",
    textStrategy: "2–4 palavras tiradas do título editorial, grandes. «JÚLIO VERNE» pequeno.",
    enabled: true,
  },
  {
    id: "vn-cidade",
    name: "Cidade",
    description: "Uma cidade ou porto é o cenário que se lê de imediato.",
    previewHint: "cidade",
    structure: "Cidade ou porto em profundidade. Personagens em primeiro plano a chegar, a olhar ou a atravessar.",
    textStrategy: "2–4 palavras tiradas do título editorial, grandes. «JÚLIO VERNE» pequeno.",
    enabled: true,
  },
  {
    id: "vn-objeto",
    name: "Objeto misterioso",
    description: "Um objeto do capítulo ocupa o centro e cria a pergunta.",
    previewHint: "objeto",
    structure: "Objeto grande e legível. Quem o encontra fica em segundo plano. Sem revelar para que serve no final.",
    textStrategy: "2–4 palavras tiradas do título editorial, grandes. «JÚLIO VERNE» pequeno.",
    enabled: true,
  },
  {
    id: "vn-perigo",
    name: "Perigo",
    description: "O perigo concreto do capítulo é o elemento principal.",
    previewHint: "perigo",
    structure: "O perigo domina. As figuras reagem (correm, apontam, navegam). Não mostrar o desfecho.",
    textStrategy: "2–4 palavras tiradas do título editorial, grandes. «JÚLIO VERNE» pequeno.",
    enabled: true,
  },
  {
    id: "vn-descoberta",
    name: "Descoberta",
    description: "O momento em que alguém vê algo pela primeira vez.",
    previewHint: "descoberta",
    structure: "Olhar para o horizonte ou apontar. O que foi descoberto está no meio ou no fundo, ainda por explicar.",
    textStrategy: "2–4 palavras tiradas do título editorial, grandes. «JÚLIO VERNE» pequeno.",
    enabled: true,
  },
];

/** Frames inside the chapter video. No lettering — the voice is the text. */
export const JULIO_VERNE_INTERIOR_STYLE_RULES = `PROMPT MASTER — ILUSTRACIONES INTERIORES JÚLIO VERNE

Create a 16:9 cinematic illustration for a Portuguese Jules Verne audiobook video.

The image will be displayed while the narrator reads the chapter. It is NOT a thumbnail and it must contain NO TEXT of any kind.

VISUAL STYLE

Classic European adventure illustration, inspired by the ligne claire tradition of Franco-Belgian adventure comics and illustrated adventure books.

The visual language should feel like a beautifully illustrated Jules Verne adventure book:

- clean, confident ink outlines
- simplified but expressive shapes
- flat or lightly shaded color areas
- elegant color blocking
- rich but controlled colors
- clear silhouettes
- strong composition
- cinematic perspective
- beautiful landscapes
- sense of exploration and discovery
- adventurous atmosphere
- historical 19th-century setting
- printed illustrated-book feeling

The result should look DRAWN and ILLUSTRATED, not photographed.

Avoid:
- photorealism
- hyperrealistic rendering
- 3D
- CGI
- anime
- manga
- modern comic-book aesthetics
- excessive painterly detail
- excessive texture
- artificial AI-looking details

The illustration should feel simple enough to understand immediately, but rich enough to reward looking at it.

COLOR AND LIGHT

Use a coherent palette appropriate to the scene.

Prefer:
deep blues,
warm ochres,
cream,
red,
forest green,
earth tones,
golden sunlight.

Use strong, readable lighting.

If the scene is dramatic, increase contrast.

If the scene is calm, use softer light.

Maintain the same artistic language throughout the entire book.

COMPOSITION

Create a strong 16:9 landscape composition.

Use three levels of depth:

FOREGROUND:
the main character, object, vehicle or action.

MIDGROUND:
the immediate environment and secondary narrative elements.

BACKGROUND:
a large landscape, architecture, sky, ocean or other environmental element.

Do not fill every part of the image.

Leave enough visual breathing room.

The composition must work on a television screen.

The viewer should immediately understand:

WHERE ARE WE?
WHAT IS HAPPENING?
WHAT SHOULD I LOOK AT?

CHARACTERS

Use historically appropriate 19th-century clothing.

Characters should look like illustrated adventure protagonists, not fashion models.

Prefer dynamic poses:

- walking
- climbing
- observing
- pointing
- exploring
- sailing
- running
- fighting
- discovering
- looking toward the horizon

Avoid static portrait poses unless the chapter specifically requires one.

Characters should have clear silhouettes and expressive body language.

Do not create recognizable real people.

NO TEXT

Absolutely no text.

No:
- letters
- words
- signs
- subtitles
- captions
- chapter numbers
- logos
- watermarks
- modern interfaces

If a historical sign or book would normally contain writing, keep it visually unreadable or omit it.

HISTORICAL ACCURACY

Everything visible should belong to the world of Jules Verne and the historical period of the story.

Use appropriate:

- clothing
- ships
- vehicles
- architecture
- weapons
- tools
- furniture
- exploration equipment

No modern cars.
No phones.
No screens.
No modern buildings.
No modern clothing.
No modern technology.

NARRATIVE RULE

The image must be based on the ACTUAL CONTENT of the chapter.

Do not invent events.

Do not create a generic Jules Verne scene.

Identify one concrete visual moment, location, discovery, danger, character interaction or important object from the chapter and build the image around it.

The image illustrates the narration.

It does NOT need to retell the entire chapter.

Do not reveal the ending of the chapter unless the selected scene itself is from the ending and the image is specifically intended for that moment.

VISUAL VARIETY

Do not use the same composition for every chapter.

Alternate between:

- wide landscapes
- medium action scenes
- environmental establishing shots
- characters interacting with the environment
- vehicles
- ships
- mysterious objects
- discoveries
- moments of danger
- quiet atmospheric scenes
- large-scale adventure scenes

Two images from the same chapter must feel related but should not be duplicates.

If a third image is generated, it must add a genuinely different visual moment.

CONTINUITY

When several chapters belong to the same book, maintain continuity of:

- character appearance
- clothing
- ships
- vehicles
- architecture
- locations
- color palette
- historical period
- artistic style

The viewer should feel that every image belongs to the SAME illustrated book.

MASTER STYLE

Classic European adventure illustration.
Ligne claire inspired.
Jules Verne.
19th-century exploration.
Clean ink drawing.
Flat elegant colors.
Cinematic landscape composition.
Expressive characters.
Detailed environments without visual clutter.
Printed adventure-book aesthetic.
Beautiful, adventurous, timeless.

16:9 LANDSCAPE.
NO TEXT.
NO LETTERING.
NO LOGOS.
NO WATERMARK.`;

export function defaultJulioVerneCoverDna(): CoverVisualDna {
  return {
    styleRules: JULIO_VERNE_COVER_STYLE_RULES,
    avoid: [...JULIO_VERNE_COVER_AVOID],
    accentColors: { primary: "azul profundo", emphasis: "ocre" },
    formats: JULIO_VERNE_COVER_FORMATS.map((f) => ({ ...f })),
    recentFormatIds: [],
  };
}

export function isJulioVerneCoverDna(cover: CoverVisualDna | null | undefined): boolean {
  const rules = cover?.styleRules ?? "";
  return /franco-belga|Hergé|JÚLIO VERNE/i.test(rules);
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
  // Auto A/B needs 3 distinct formats — if Amor Amor DNA was trimmed, fill from that library.
  if (enabled.length < 3 && cover.styleRules.includes("hyperrealistic photography")) {
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
