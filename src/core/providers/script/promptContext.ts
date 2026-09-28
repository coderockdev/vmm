import { Channel } from "../../types";

/**
 * Assembles the SCRIPT GENERATION CONTEXT described in the VMM spec:
 *
 *   CHANNEL CONTEXT + CHANNEL RULES + RELEVANT HISTORY + REQUESTED TOPIC
 *   = SCRIPT GENERATION CONTEXT
 *
 * This is the ONE place that combines a channel's permanent DNA with a
 * variable topic. Every ScriptProvider (mock today, a real LLM tomorrow)
 * must build its prompt/context through this function instead of ever
 * receiving the bare topic string on its own. This is what makes the
 * Channel DNA "govern" generation rather than being a suggestion.
 */
export function buildScriptGenerationContext(args: {
  channel: Channel;
  topic: string;
  previousTitles?: string[];
}): string {
  const { channel, topic } = args;
  const dna = channel.dna;
  const previousTitles = args.previousTitles ?? [];

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
    `- Assuntos a evitar: ${dna.avoid.join(", ")}`,
    `- Estrutura do roteiro: ${dna.scriptRules.structure}`,
    `- Abertura: ${dna.scriptRules.opening}`,
    `- CTA: ${dna.scriptRules.cta}`,
    ``,
    `REGRAS:`,
    `- respeite o nicho;`,
    `- respeite o idioma;`,
    `- respeite o tom;`,
    `- respeite a estrutura;`,
    `- não saia da premissa editorial;`,
    `- não introduza assuntos não relacionados;`,
    `- evite repetir literalmente roteiros anteriores.`,
    ...(previousTitles.length
      ? [``, `TÍTULOS JÁ PRODUZIDOS (não repetir):`, ...previousTitles.map((t) => `- ${t}`)]
      : []),
    ``,
    `ASSUNTO DESTA PRODUÇÃO:`,
    `"${topic}"`,
    ``,
    `Gere um roteiro compatível com esse canal.`,
  ].join("\n");
}
