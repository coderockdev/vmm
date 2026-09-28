import { getChannel } from "../repo/channels";
import { getIdea } from "../repo/plans";
import {
  getVideoProject,
  setTtsProviderOverride,
  createScript,
  attachScriptToProject,
  listScriptTextsForChannel,
} from "../repo/projects";
import { createJob } from "../repo/jobs";
import { enqueueJob } from "./queue";
import { getScriptProvider } from "../providers/script";
import { parseGeneratedScript } from "../scriptLines";
import { TTSProviderName } from "../providers/tts/TTSProvider";
import { Script } from "../types";

/**
 * The human-review gate: a VideoProject sits at status "script" until this is
 * called. Picks the voice for this generation (or keeps the channel default)
 * and hands the project to the existing single-concurrency queue — from here
 * on nothing changes vs. the old one-shot flow (runProject.ts is untouched).
 */
export async function approveScriptAndProduce(
  projectId: string,
  ttsProviderOverride: TTSProviderName | null
): Promise<void> {
  const project = await getVideoProject(projectId);
  if (!project) throw new Error(`Video project not found: ${projectId}`);
  if (project.status !== "script") {
    throw new Error(`Project is not awaiting review (status: ${project.status})`);
  }

  if (ttsProviderOverride) {
    await setTtsProviderOverride(projectId, ttsProviderOverride);
  }

  const job = await createJob({ videoProjectId: project.id, channelId: project.channelId });
  await enqueueJob(job.id);
}

/**
 * Discards the current script and generates a fresh one for the same idea —
 * optionally with a different AI provider. Project stays at status "script"
 * so it's still sitting in the review queue afterwards.
 */
export async function regenerateScript(projectId: string, aiProviderOverride: string | null): Promise<Script> {
  const project = await getVideoProject(projectId);
  if (!project) throw new Error(`Video project not found: ${projectId}`);
  if (project.status !== "script") {
    throw new Error(`Project is not awaiting review (status: ${project.status})`);
  }

  const channel = await getChannel(project.channelId);
  if (!channel) throw new Error(`Channel not found: ${project.channelId}`);

  const idea = project.contentIdeaId ? await getIdea(project.contentIdeaId) : null;
  if (!idea) throw new Error("Original content idea not found; cannot regenerate this script.");

  const provider = getScriptProvider(aiProviderOverride);
  const previousScripts = await listScriptTextsForChannel(channel.id);

  const generated = channel.dna.usesScript
    ? await provider.generateScript({
        channel,
        topic: project.topic,
        contentIdea: idea,
        durationMinutes: project.durationMinutes,
        previousScripts,
      })
    : { rawText: `Ambiente contínuo sobre ${project.topic}.`, sectionBreaks: [] };

  const rawLines = parseGeneratedScript(generated, channel.dna.scriptRules.pauses);
  const wordCount = rawLines.reduce((sum, l) => sum + l.text.split(/\s+/).filter(Boolean).length, 0);

  const script = await createScript({
    videoProjectId: project.id,
    rawText: generated.rawText,
    lines: rawLines.map((l) => ({ text: l.text, start: 0, end: 0, pauseAfter: l.pauseAfter, sectionBreak: l.sectionBreak })),
    wordCount,
  });
  await attachScriptToProject(project.id, script.id);

  return script;
}
