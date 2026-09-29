import { Channel } from "../../types";
import { ContentIdeaDraft } from "./ScriptProvider";
import { inferBucket, pickAngleTemplates } from "./phraseBanks";

/**
 * DNA-based topic chips for the "Criar conteúdo" card — seeds the textarea
 * with subjects that already match the channel's niche/language/topics.
 */
export function suggestTopicsFromDna(channel: Channel, limit = 6): string[] {
  const topics = (channel.dna.topics ?? []).map((t) => t.trim()).filter(Boolean);
  const language = channel.dna.language;
  const bucket = inferBucket(topics);
  const hits = (channel.dna.successfulTitles ?? []).slice(0, 8);

  const fromTopics = topics.slice(0, Math.min(limit, topics.length));
  const fromHits = hits
    .map((t) => {
      const base = t.split("|")[0].trim();
      return base.length > 72 ? `${base.slice(0, 70)}…` : base;
    })
    .filter(Boolean);

  const seeds =
    language === "es"
      ? bucket === "prayer"
        ? [
            "que regrese desesperado esta noche",
            "rompió el silencio después de días",
            "te bloqueó y no da señales",
            "orgullo que no lo deja escribir",
            "que recuerde tu nombre ahora",
            "oración de las 3 minutos",
          ]
        : [
            "abrir caminos en el amor",
            "soltar el resentimiento",
            "recuperar la autoestima",
            "calma después de una pelea",
          ]
      : bucket === "prayer"
        ? [
            "atravessar uma noite difícil",
            "pedir paz interior",
            "fortalecer a fé",
            "gratidão antes de dormir",
          ]
        : bucket === "story"
          ? ["um imprevisto engraçado", "uma descoberta surpreendente", "um problema resolvido na marra"]
          : ["foco e descanso", "noite tranquila", "chuva suave"];

  const out: string[] = [];
  for (const t of [...fromHits.slice(0, 3), ...fromTopics, ...fromHits.slice(3), ...seeds]) {
    if (out.length >= limit) break;
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, limit);
}

/**
 * Placeholder sample idea cards (Ideias tab) derived from channel DNA —
 * never the generic "persistência" stubs that ignore the niche.
 */
export function sampleIdeasFromDna(channel: Channel, quantity = 3): Array<ContentIdeaDraft & { id: string }> {
  const topics = suggestTopicsFromDna(channel, Math.max(quantity, 3));
  const templates = pickAngleTemplates(inferBucket(channel.dna.topics), channel.dna.language);
  const ideas: Array<ContentIdeaDraft & { id: string }> = [];

  for (let i = 0; i < quantity; i++) {
    const topic = topics[i % topics.length];
    const template = templates[i % templates.length];
    ideas.push({
      id: `dna-sample-${i}-${topic.slice(0, 24).replace(/\s+/g, "-").toLowerCase()}`,
      title: template.title(topic),
      angle: template.angle,
      objective: template.objective,
    });
  }
  return ideas;
}

/**
 * Sample proven titles for prompts (stable shuffle by quantity so batches vary).
 */
export function sampleSuccessfulTitles(channel: Channel, limit = 16): string[] {
  const bank = (channel.dna.successfulTitles ?? []).map((t) => t.trim()).filter(Boolean);
  if (bank.length === 0) return [];
  if (bank.length <= limit) return bank;
  const start = (limit * 7 + bank.length) % bank.length;
  const out: string[] = [];
  for (let i = 0; i < limit; i++) {
    out.push(bank[(start + i * 11) % bank.length]);
  }
  return out;
}

/** Extra prompt block appended when asking the LLM for a content plan. */
export function contentPlanDnaBrief(channel: Channel, quantity = 1): string {
  const dna = channel.dna;
  const hitTitles = sampleSuccessfulTitles(channel, Math.min(18, Math.max(10, quantity * 3)));
  const diversity =
    quantity >= 5
      ? [
          `- VARIEDADE OBRIGATÓRIA: gere ${quantity} ideias BEM DIFERENTES entre si (situações, ganchos e emoções distintas).`,
          `- Cubra ângulos distintos do DNA (ex.: regresso, bloqueio, orgulho, mensagem inesperada, chamada, arrepentimento, silêncio, ciúmes) — sem repetir a mesma fórmula de título.`,
          `- Cada título deve poder ser um vídeo próprio; se duas ideias soarem iguais, reescreva.`,
        ]
      : quantity > 1
        ? [
            `- As ${quantity} ideias devem variar o ângulo (não clones com título quase igual).`,
          ]
        : [];

  const titleBankBlock =
    hitTitles.length > 0
      ? [
          ``,
          `BANCO DE TÍTULOS DE SUCESSO DESTE CANAL (${(dna.successfulTitles ?? []).length} no DNA):`,
          `Use como REFERÊNCIA de padrão (urgência, aviso/cuidado, timeframe em minutos, santo/deidad, resultado emocional, MAIÚSCULAS estratégicas).`,
          `PROIBIDO copiar literalmente qualquer título abaixo. Invente títulos NOVOS com o mesmo ADN de click + promessa.`,
          ...hitTitles.map((t) => `- ${t}`),
          `- Estruturas vencedoras a variar: aviso+promessa | resultado em X minutos | di su nombre… | santo/oración + regresso | “no hay vuelta atrás”.`,
        ]
      : [];

  return [
    ``,
    `TAREFA: gerar ${quantity} ideia(s) de VÍDEO para este canal (não roteiro ainda).`,
    `- Idioma das ideias (título/ângulo/objetivo): ${dna.language}.`,
    `- Tom: ${dna.tone.join(", ") || "o tom do DNA"}.`,
    `- Temas preferidos: ${(dna.topics ?? []).join(", ") || "os temas do DNA"}.`,
    `- Público: ${dna.audience}`,
    `- Cada ideia deve parecer nativa deste canal — se trocar o nome do canal, a ideia NÃO deveria servir para outro nicho.`,
    ...diversity,
    ...titleBankBlock,
    dna.avoid.length
      ? `- NÃO proponha ideias sobre: ${dna.avoid.slice(0, 12).join("; ")}.`
      : ``,
    dna.scriptRules.generationPrompt?.trim()
      ? `- Respeite o espírito do MODELO DE ROTEIRO do canal (gancho, emoção, CTA) ao formular título/ângulo.`
      : ``,
  ]
    .filter(Boolean)
    .join("\n");
}
