import { Channel, ContentIdea } from "../../types";
import { UsageSnapshot } from "../../usage/types";

export interface ContentIdeaDraft {
  title: string;
  angle: string;
  objective: string;
}

export interface GenerateContentPlanArgs {
  channel: Channel;
  topic: string;
  quantity: number;
  /** Titles/angles already used in previous plans for this channel, to avoid repetition. */
  previousTitles: string[];
}

export interface GenerateScriptArgs {
  channel: Channel;
  topic: string;
  contentIdea: ContentIdea;
  durationMinutes: number;
  /** Raw text of previous scripts in this channel, to avoid literal repetition. */
  previousScripts: string[];
}

export interface GeneratedScript {
  /**
   * One sentence/line per paragraph, separated by a blank line — this is the
   * shared convention every ScriptProvider (mock or a future LLM) must follow
   * so the app can split it into synced ScriptLine[] generically.
   */
  rawText: string;
  /**
   * 0-based line indices (into the blank-line-split array) after which a
   * bigger "section" pause should be inserted instead of the normal
   * between-lines pause. Optional — omitted lines just use the normal pause.
   */
  sectionBreaks?: number[];
  /** Token/usage snapshot from the LLM call that produced this script. */
  usage?: UsageSnapshot;
}

export interface ContentPlanResult {
  ideas: ContentIdeaDraft[];
  usage?: UsageSnapshot;
}

/**
 * ScriptProvider is the single seam between VMM and any script-generation
 * backend (mock, local model, or a future LLM API). Nothing outside this
 * interface should ever talk to an AI provider directly.
 */
export interface ScriptProvider {
  /** Turns one topic into N distinct content ideas (the Content Plan). */
  generateContentPlan(args: GenerateContentPlanArgs): Promise<ContentPlanResult>;

  /** Turns one content idea + the channel's permanent DNA into a full script. */
  generateScript(args: GenerateScriptArgs): Promise<GeneratedScript>;
}
