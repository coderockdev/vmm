import { Channel, ContentIdea, VideoFormat } from "../types";
import { TTSProviderName } from "../providers/tts/TTSProvider";
import { getScriptProvider } from "../providers/script";
import { createContentPlan, listAllIdeaTitlesForChannel } from "../repo/plans";
import { createVideoProject, createScript, attachScriptToProject, listScriptTextsForChannel } from "../repo/projects";
import { createJob } from "../repo/jobs";
import { enqueueJob } from "./queue";
import { parseGeneratedScript } from "../scriptLines";
import { hashStringToSeed } from "../../remotion/seededRandom";

export async function generateContentPlanForChannel(args: {
  channel: Channel;
  topic: string;
  quantity: number;
  durationMinutes: number;
  format: VideoFormat;
}) {
  const provider = getScriptProvider();
  const previousTitles = listAllIdeaTitlesForChannel(args.channel.id);

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
 * Turns approved content ideas into VideoProjects + queued ProductionJobs.
 * Script generation happens here, synchronously (cheap with mock/local
 * providers) — only audio+render go through the single-concurrency queue.
 */
export async function generateVideosForIdeas(args: {
  channel: Channel;
  topic: string;
  durationMinutes: number;
  format: VideoFormat;
  ideas: ContentIdea[];
  ttsProviderOverride?: TTSProviderName | null;
}): Promise<string[]> {
  const provider = getScriptProvider();
  const previousScripts = listScriptTextsForChannel(args.channel.id);
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

      const project = createVideoProject({
        channelId: args.channel.id,
        contentIdeaId: idea.id,
        title: idea.title,
        topic: args.topic,
        durationMinutes: args.durationMinutes,
        format,
        seed,
        ttsProviderOverride: args.ttsProviderOverride ?? null,
      });

      const script = createScript({
        videoProjectId: project.id,
        rawText: generated.rawText,
        lines: rawLines.map((l) => ({ text: l.text, start: 0, end: 0, pauseAfter: l.pauseAfter, sectionBreak: l.sectionBreak })),
        wordCount,
      });
      attachScriptToProject(project.id, script.id);

      const job = createJob({ videoProjectId: project.id, channelId: args.channel.id });
      enqueueJob(job.id);

      createdProjectIds.push(project.id);
    }
  }

  return createdProjectIds;
}
