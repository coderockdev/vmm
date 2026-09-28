import { Channel, ContentIdea, VideoFormat } from "../types";
import { getScriptProvider } from "../providers/script";
import { createContentPlan, listAllIdeaTitlesForChannel } from "../repo/plans";
import { createVideoProject, createScript, attachScriptToProject, updateProjectStatus, listScriptTextsForChannel } from "../repo/projects";
import { parseGeneratedScript } from "../scriptLines";
import { hashStringToSeed } from "../../remotion/seededRandom";

export async function generateContentPlanForChannel(args: {
  channel: Channel;
  topic: string;
  quantity: number;
  durationMinutes: number;
  format: VideoFormat;
  aiProviderOverride?: string | null;
}) {
  const provider = getScriptProvider(args.aiProviderOverride);
  const previousTitles = await listAllIdeaTitlesForChannel(args.channel.id);

  const ideas = await provider.generateContentPlan({
    channel: args.channel,
    topic: args.topic,
    quantity: args.quantity,
    previousTitles,
  });

  return createContentPlan({
    channelId: args.channel.id,
    topic: args.topic,
    quantity: args.quantity,
    durationMinutes: args.durationMinutes,
    format: args.format,
    ideas,
  });
}

/**
 * Turns approved content ideas into VideoProjects + Scripts, status "script"
 * (generated, awaiting human review). Does NOT create/enqueue a
 * ProductionJob — that only happens once a human approves the script and
 * picks a voice, via approveScriptAndProduce() in pipeline/produce.ts.
 */
export async function generateScriptsForIdeas(args: {
  channel: Channel;
  topic: string;
  durationMinutes: number;
  format: VideoFormat;
  ideas: ContentIdea[];
  aiProviderOverride?: string | null;
}): Promise<string[]> {
  const provider = getScriptProvider(args.aiProviderOverride);
  const previousScripts = await listScriptTextsForChannel(args.channel.id);
  const createdProjectIds: string[] = [];

  const formats: Exclude<VideoFormat, "both">[] = args.format === "both" ? ["video", "short"] : [args.format];

  for (const idea of args.ideas) {
    const generated = args.channel.dna.usesScript
      ? await provider.generateScript({
          channel: args.channel,
          topic: args.topic,
          contentIdea: idea,
          durationMinutes: args.durationMinutes,
          previousScripts,
        })
      : { rawText: `Ambiente contínuo sobre ${args.topic}.`, sectionBreaks: [] };

    const rawLines = parseGeneratedScript(generated, args.channel.dna.scriptRules.pauses);
    const wordCount = rawLines.reduce((sum, l) => sum + l.text.split(/\s+/).filter(Boolean).length, 0);

    for (const format of formats) {
      const seed = hashStringToSeed(`${idea.id}-${format}`);

      const project = await createVideoProject({
        channelId: args.channel.id,
        contentIdeaId: idea.id,
        title: idea.title,
        topic: args.topic,
        durationMinutes: args.durationMinutes,
        format,
        seed,
      });

      const script = await createScript({
        videoProjectId: project.id,
        rawText: generated.rawText,
        lines: rawLines.map((l) => ({ text: l.text, start: 0, end: 0, pauseAfter: l.pauseAfter, sectionBreak: l.sectionBreak })),
        wordCount,
      });
      await attachScriptToProject(project.id, script.id);
      await updateProjectStatus(project.id, "script");

      createdProjectIds.push(project.id);
    }
  }

  return createdProjectIds;
}
