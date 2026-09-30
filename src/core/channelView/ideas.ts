import { Channel, ContentPlan, VideoFormat } from "../types";
import { buildScriptGenerationContext } from "../providers/script/promptContext";
import { contentPlanDnaBrief } from "../providers/script/ideaSuggestions";
import { contentPlanJsonInstructions, parseContentPlanJson } from "../providers/script/llmContract";
import { resolveAutoTopic } from "../pipeline/autoFlow";
import { createContentPlan, listAllIdeaTitlesForChannel } from "../repo/plans";
import { insertUsageEvent } from "../repo/usage";
import { completerFor, mergeUsage, ChannelViewProvider } from "./llm";
import { updateChannelViewIdea } from "./ideaRepo";

/** The channel exactly as the generation sees it: full DNA + script model (falls back to the channel's script skill). */
export function channelForGeneration(channel: Channel, useSuccessfulTitles: boolean): Channel {
  const scriptModel = channel.dna.scriptRules.generationPrompt?.trim() || channel.scriptSkill.trim();
  return {
    ...channel,
    dna: {
      ...channel.dna,
      successfulTitles: useSuccessfulTitles ? channel.dna.successfulTitles : [],
      scriptRules: { ...channel.dna.scriptRules, generationPrompt: scriptModel },
    },
  };
}

function headlinePrompt(channel: Channel, topic: string, ideas: Array<{ title: string; angle: string }>): string {
  const hits = (channel.dna.successfulTitles ?? []).map((title) => title.trim()).filter(Boolean).slice(0, 15);
  return [
    buildScriptGenerationContext({ channel, topic }),
    ``,
    `TAREFA: reescrever o TÍTULO de cada ideia abaixo como manchete de YouTube, no padrão dos títulos de sucesso deste canal.`,
    hits.length ? `Títulos de sucesso (imite o padrão, NÃO copie literal):\n${hits.map((title) => `- ${title}`).join("\n")}` : ``,
    ``,
    `IDEIAS:`,
    ...ideas.map((idea, index) => `${index + 1}. ${idea.title} — ${idea.angle}`),
    ``,
    `Responda APENAS com JSON: {"headlines":["manchete da ideia 1","manchete da ideia 2"]} — exatamente ${ideas.length} itens, na mesma ordem, cada um com no máximo 100 caracteres, no idioma do canal.`,
  ].filter(Boolean).join("\n");
}

function parseHeadlines(text: string, expected: number): string[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const json = JSON.parse(text.slice(start, end + 1));
    const list: unknown[] = Array.isArray(json.headlines) ? json.headlines : [];
    return list.slice(0, expected).map((item) => String(item ?? "").trim());
  } catch {
    return [];
  }
}

export interface ChannelViewIdeasResult {
  plan: ContentPlan;
  resolvedTopic: string;
  headlinesApplied: boolean;
}

/**
 * "Gerar assuntos": asks the chosen AI for N ideas using the whole channel
 * context (DNA, script model, successful titles) and saves them as a plan.
 */
export async function generateChannelViewIdeas(args: {
  channel: Channel;
  topic: string;
  quantity: number;
  durationMinutes: number;
  format: VideoFormat;
  provider: ChannelViewProvider;
  useSuccessfulTitles: boolean;
  rewriteHeadlines: boolean;
}): Promise<ChannelViewIdeasResult> {
  const channel = channelForGeneration(args.channel, args.useSuccessfulTitles);
  const topic = resolveAutoTopic(channel, args.topic);
  const complete = completerFor(args.provider);
  const previousTitles = await listAllIdeaTitlesForChannel(channel.id);

  const prompt = [
    buildScriptGenerationContext({ channel, topic, previousTitles }),
    contentPlanDnaBrief(channel, args.quantity),
    contentPlanJsonInstructions(args.quantity),
  ].join("");
  const { text, usage: ideasUsage } = await complete(prompt);
  const ideas = parseContentPlanJson(text, args.quantity);
  let usage = ideasUsage;

  let headlinesApplied = false;
  if (args.rewriteHeadlines && ideas.length > 0) {
    try {
      const rewritten = await complete(headlinePrompt(channel, topic, ideas));
      usage = mergeUsage(usage, rewritten.usage) ?? usage;
      const headlines = parseHeadlines(rewritten.text, ideas.length);
      headlines.forEach((headline, index) => {
        if (headline) ideas[index] = { ...ideas[index], title: headline.slice(0, 100) };
      });
      headlinesApplied = headlines.some(Boolean);
    } catch (err) {
      console.warn("[channel-view] headline rewrite skipped:", err instanceof Error ? err.message : err);
    }
  }

  const plan = await createContentPlan({
    channelId: channel.id,
    topic,
    quantity: args.quantity,
    durationMinutes: args.durationMinutes,
    format: args.format,
    ideas,
  });
  await insertUsageEvent({ channelId: channel.id, contentPlanId: plan.id, stage: "ideas", snapshot: usage });
  return { plan, resolvedTopic: topic, headlinesApplied };
}

export { updateChannelViewIdea };
