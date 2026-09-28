import {
  GenerateContentPlanArgs,
  GenerateScriptArgs,
  GeneratedScript,
  ContentIdeaDraft,
  ScriptProvider,
} from "./ScriptProvider";
import { buildScriptGenerationContext } from "./promptContext";
import {
  inferBucket,
  pickAngleTemplates,
  buildAffirmationSections,
  buildPrayerSections,
  buildStorySections,
  buildAmbientSections,
  ScriptSections,
} from "./phraseBanks";

/**
 * A deterministic, no-network stand-in for a real LLM. It still goes through
 * buildScriptGenerationContext() so the "channel DNA governs generation"
 * contract is exercised end to end — swapping this for ClaudeScriptProvider /
 * OpenAIScriptProvider later means implementing the same interface and
 * feeding that same context string as the system/user prompt.
 */
export class MockScriptProvider implements ScriptProvider {
  async generateContentPlan(args: GenerateContentPlanArgs): Promise<ContentIdeaDraft[]> {
    // Context is built (and would be sent to a real LLM here) even though the
    // mock only reads a slice of it — this keeps the seam realistic.
    void buildScriptGenerationContext({
      channel: args.channel,
      topic: args.topic,
      previousTitles: args.previousTitles,
    });

    const bucket = inferBucket(args.channel.dna.topics);
    const templates = pickAngleTemplates(bucket, args.channel.dna.language);
    const usedTitles = new Set(args.previousTitles.map((t) => t.toLowerCase()));

    const ideas: ContentIdeaDraft[] = [];
    let templateIndex = 0;
    let cycle = 0;
    while (ideas.length < args.quantity && cycle < 10) {
      const template = templates[templateIndex % templates.length];
      let title = template.title(args.topic);
      if (cycle > 0) title = `${title} (v${cycle + 1})`;
      templateIndex++;
      if (templateIndex % templates.length === 0) cycle++;

      if (usedTitles.has(title.toLowerCase())) continue;
      usedTitles.add(title.toLowerCase());
      ideas.push({ title, angle: template.angle, objective: template.objective });
    }
    return ideas;
  }

  async generateScript(args: GenerateScriptArgs): Promise<GeneratedScript> {
    void buildScriptGenerationContext({
      channel: args.channel,
      topic: args.topic,
      previousTitles: args.previousScripts.slice(0, 5),
    });

    const bucket = inferBucket(args.channel.dna.topics);
    const language = args.channel.dna.language;

    let sections: ScriptSections;
    if (bucket === "affirmation") {
      sections = buildAffirmationSections(
        args.topic,
        args.contentIdea.angle,
        language === "es" ? "es" : "pt",
        args.durationMinutes
      );
    } else if (bucket === "prayer") {
      sections = buildPrayerSections(args.topic, args.contentIdea.angle, args.durationMinutes);
    } else if (bucket === "story") {
      sections = buildStorySections(args.topic, args.contentIdea.angle, args.durationMinutes);
    } else {
      sections = buildAmbientSections(args.topic);
    }

    // Note: dna.scriptRules.cta is an editorial RULE ("keep it short and
    // natural"), not literal text — the actual CTA sentence already lives in
    // each bucket's `closing` section in phraseBanks.ts.
    const groups = [sections.opening, sections.preparation, sections.main, sections.reflection, sections.closing];

    const lines: string[] = [];
    const sectionBreaks: number[] = [];
    for (const group of groups) {
      for (const line of group) lines.push(line);
      if (group.length > 0) sectionBreaks.push(lines.length - 1);
    }

    const rawText = lines.length ? lines.join("\n\n") : `Ambiente contínuo sobre ${args.topic}.`;

    return { rawText, sectionBreaks };
  }
}
