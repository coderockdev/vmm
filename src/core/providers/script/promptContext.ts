import { Channel } from "../../types";
import {
  charsForDuration,
  DEFAULT_CHARS_PER_WORD,
  DEFAULT_WORDS_PER_MINUTE,
  wordsForDuration,
} from "../../scriptBudget";
import { profileFromLegacyVoice } from "../tts/voiceCapabilities";

/**
 * Assembles the SCRIPT GENERATION CONTEXT described in the VMM spec:
 *
 *   CHANNEL CONTEXT + CHANNEL RULES + RELEVANT HISTORY + REQUESTED TOPIC
 *   = SCRIPT GENERATION CONTEXT
 */
export function buildScriptGenerationContext(args: {
  channel: Channel;
  topic: string;
  previousTitles?: string[];
  durationMinutes?: number;
}): string {
  const { channel, topic } = args;
  const dna = channel.dna;
  const previousTitles = args.previousTitles ?? [];
  const durationMinutes = args.durationMinutes;
  const generationPrompt = (dna.scriptRules.generationPrompt ?? "").trim();

  const wpm = dna.scriptRules.wordsPerMinute ?? DEFAULT_WORDS_PER_MINUTE;
  const cpw = dna.scriptRules.charsPerWord ?? DEFAULT_CHARS_PER_WORD;
  const targetWords =
    durationMinutes && durationMinutes > 0 ? wordsForDuration(durationMinutes, wpm) : null;
  const targetChars =
    durationMinutes && durationMinutes > 0 ? charsForDuration(durationMinutes, wpm, cpw) : null;

  const voiceProfile =
    dna.voice.profile ??
    profileFromLegacyVoice({
      provider: dna.voice.provider,
      voiceId: dna.voice.voiceId,
      speed: dna.voice.speed,
      language: dna.language,
    });

  const perf = dna.scriptRules.performanceTags;
  const allowedFromVoice = voiceProfile.capabilities.allowed_tags;
  // HeyGen / ElevenLabs: always inject valid emotion + pause tags by default so
  // narration sounds natural — DNA can still narrow the selected list.
  const voiceWantsTags =
    voiceProfile.capabilities.emotion_tags &&
    (voiceProfile.provider === "heygen" ||
      voiceProfile.provider === "elevenlabs" ||
      Boolean(perf?.enabled));
  const selected =
    perf?.enabled && Array.isArray(perf.selected) && perf.selected.length > 0
      ? perf.selected
      : allowedFromVoice;
  const allowedTags = voiceWantsTags
    ? selected.filter((t) => allowedFromVoice.includes(t) || allowedFromVoice.length === 0)
    : [];
  const useTags = allowedTags.length > 0 && voiceProfile.capabilities.emotion_tags;

  const voiceRules: string[] = [
    ``,
    `VOZ DO CANAL (${voiceProfile.voice_name} / ${voiceProfile.provider}):`,
    `- NÃO use tags de sotaque (ex. [soft Colombian accent]) — o sotaque vem da voz escolhida, nunca de uma tag.`,
  ];
  if (useTags) {
    const density = perf?.tagsPerThousandWords ?? 35;
    const approxEvery = Math.max(1, Math.round(1000 / density / 12)); // rough: ~12 words/phrase
    voiceRules.push(
      `- OBRIGATÓRIO para naturalidade desta voz: espalhe tags de emoção/pausa válidas no texto falado.`,
      `- A PRIMEIRA frase falada do roteiro (cena 1) DEVE começar com direção emocional — ex. [softly], [emotional], [sighs] ou [pause] — nunca abrir sem tags.`,
      `- Em CADA cena, as 1–2 primeiras frases também devem ter tags; continue no meio e no clímax (não concentre só no final).`,
      `- Pode usar APENAS estas tags de interpretação: ${allowedTags.join(", ")}.`,
      `- Densidade alvo: ~${density} tags de emoção/pausa por 1.000 palavras (pouco≈20, médio≈35, muito≈50). Não saturar; espalhar ao longo do roteiro (cerca de 1 tag a cada ~${approxEvery} frases curtas).`,
      voiceProfile.capabilities.break_tags ||
        voiceProfile.provider === "elevenlabs" ||
        voiceProfile.provider === "heygen"
        ? `- Pausas estruturais: use <break time="2.7s"/> antes de invocações fortes e <break time="1.4s"/> entre alguns parágrafos (3–4 por cena) — isso é aparte da densidade de tags [...].`
        : `- NÃO use <break time="…"/> — este motor não aceita; use [pause] se estiver na lista permitida.`,
      `- As tags NÃO são faladas: são direção de performance. Não invente outras tags.`
    );
  } else {
    voiceRules.push(
      `- NÃO use nenhuma tag entre colchetes [...] nem <break> / direção de cena — o motor leria em voz alta.`
    );
  }

  return [
    `SYSTEM CONTEXT:`,
    `Você cria conteúdo para o canal "${channel.name}".`,
    ``,
    `CONTEXTO DO CANAL:`,
    `- Descrição: ${dna.description}`,
    `- Propósito: ${dna.purpose}`,
    `- Público: ${dna.audience}`,
    `- Idioma: ${dna.language}`,
    `- Tom: ${dna.tone.join(", ")}`,
    `- Temas permitidos: ${dna.topics.join(", ")}`,
    `- Estrutura do roteiro (resumo): ${dna.scriptRules.structure}`,
    `- Abertura: ${dna.scriptRules.opening}`,
    `- CTA: ${dna.scriptRules.cta}`,
    ``,
    `PROIBIDO ABSOLUTO (Assuntos a evitar — se aparecer no roteiro, o texto está ERRADO):`,
    ...(dna.avoid.length
      ? dna.avoid.map((item) => `- NUNCA diga / faça / sugira: "${item}"`)
      : [`- (nenhum item extra)`]),
    `- NUNCA abra com respiração, relaxamento, "respira profundamente", "relájate", "cierra los ojos", meditação, mindfulness ou bem-estar suave se isso estiver na lista acima ou contradisser a descrição do canal.`,
    `- NUNCA vaze meta-texto editorial ("hoy vamos a trabajar en…", ângulo, objetivo da ideia) — só fala dirigida ao espectador.`,
    ...(generationPrompt
      ? [
          ``,
          `MODELO DE ROTEIRO DESTE CANAL (obrigatório — siga à risca):`,
          generationPrompt,
        ]
      : []),
    ...voiceRules,
    ``,
    `REGRAS:`,
    `- respeite o nicho;`,
    `- respeite o idioma;`,
    `- respeite o tom;`,
    `- respeite a estrutura e o modelo de roteiro do canal;`,
    `- não saia da premissa editorial;`,
    `- não introduza assuntos não relacionados;`,
    `- evite repetir literalmente roteiros anteriores;`,
    `- números por extenso quando fizer sentido na narração.`,
    ...(durationMinutes && targetWords && targetChars
      ? [
          `- a narração deve preencher cerca de ${durationMinutes} minutos (~${targetWords} palavras / ~${targetChars} caracteres, ritmo ~${wpm} ppm);`,
          `- não encher com as mesmas frases em loop; desenvolva conteúdo real na duração.`,
        ]
      : []),
    ...(previousTitles.length
      ? [``, `TÍTULOS JÁ PRODUZIDOS (não repetir):`, ...previousTitles.map((t) => `- ${t}`)]
      : []),
    ``,
    `ASSUNTO DESTA PRODUÇÃO (isto é o tema da oração — nunca leia instruções de bastidor):`,
    `"${topic}"`,
    `- Se o assunto parecer uma lista de títulos ou disser «referencias», ignore essa lista. Fale só da dor, do silêncio e do regresso. Nunca diga «nuevos títulos», «referencias» nem leia títulos de outros vídeos.`}
    ``,
    `Gere um roteiro compatível com esse canal — começando no tom certo deste DNA, nunca no template genérico de meditação.`,
  ].join("\n");
}
