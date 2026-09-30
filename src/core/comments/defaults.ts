import type { CommentAutomationConfig } from "./types";
import { DEFAULT_COMMENT_AUTOMATION } from "./types";
import { AMOR_AMOR_REPLY_BANK } from "./replyBank";

/** Amor Amor defaults — cheap rule-based replies, no AI. */
export function defaultAmorAmorCommentAutomation(): CommentAutomationConfig {
  return {
    ...DEFAULT_COMMENT_AUTOMATION,
    enabled: true,
    language: "es",
    aiEnabled: false,
    maxPerRun: 50,
    responseSets: { ...AMOR_AMOR_REPLY_BANK },
  };
}

export function normalizeCommentAutomation(
  raw: CommentAutomationConfig | null | undefined
): CommentAutomationConfig {
  if (!raw) return { ...DEFAULT_COMMENT_AUTOMATION };
  return {
    enabled: raw.enabled !== false,
    language: raw.language === "pt" || raw.language === "en" ? raw.language : "es",
    aiEnabled: Boolean(raw.aiEnabled),
    maxPerRun: Math.min(200, Math.max(1, Number(raw.maxPerRun) || 50)),
    skipDelicate: raw.skipDelicate !== false,
    varyResponses: raw.varyResponses !== false,
    skipAlreadyAnswered: raw.skipAlreadyAnswered !== false,
    responseSets: raw.responseSets,
  };
}
