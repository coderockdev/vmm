import { VoiceProfile } from "./voiceCapabilities";

const BRACKET_TAG_RE = /\[[^\]]{1,80}\]/g;
const ANGLE_TAG_RE = /<[^>]{1,120}>/g;
const BREAK_TAG_RE = /<break\s+time=["']?([\d.]+)s["']?\s*\/>/gi;

export class VoiceCompileError extends Error {
  constructor(public readonly badTags: string[]) {
    super(`Tags não aceitas por esta voz: ${badTags.join(", ")}`);
    this.name = "VoiceCompileError";
  }
}

function unique(tags: string[]): string[] {
  return [...new Set(tags)];
}

function isAccentTag(tag: string): boolean {
  return /accent/i.test(tag);
}

/**
 * Parse every `[...]` and `<...>` directive. Accent tags are always blocked.
 * Bracket emotion tags must be in `allowed_tags` when emotion_tags is on.
 * `<break>` is allowed for heygen/cartesia (native) and elevenlabs (converted).
 */
export function validateScriptForVoice(
  script: string,
  profile: VoiceProfile
): { ok: true } | { ok: false; badTags: string[] } {
  const found = unique([...(script.match(BRACKET_TAG_RE) ?? []), ...(script.match(ANGLE_TAG_RE) ?? [])]);
  const allowed = new Set(profile.capabilities.allowed_tags.map((t) => t.toLowerCase()));
  const bad: string[] = [];

  for (const tag of found) {
    if (isAccentTag(tag)) {
      bad.push(tag);
      continue;
    }

    if (tag.startsWith("<")) {
      if (/^<break\b/i.test(tag)) {
        const breaksOk =
          profile.capabilities.break_tags ||
          profile.provider === "elevenlabs"; // source form OK; converted at compile
        if (!breaksOk) bad.push(tag);
        continue;
      }
      // Source scripts should use bracket tags; raw cartesia XML in source is rejected.
      bad.push(tag);
      continue;
    }

    if (!profile.capabilities.emotion_tags || !allowed.has(tag.toLowerCase())) {
      bad.push(tag);
    }
  }

  if (bad.length) return { ok: false, badTags: unique(bad) };
  return { ok: true };
}

function convertBreaksForEleven(script: string): string {
  // ElevenLabs v3 understands [pause] natively; map SSML breaks to real pauses.
  return script.replace(BRACKET_TAG_RE, (tag) => {
    const t = tag.toLowerCase();
    if (t === "[pause]") return " ... [pause] ... ";
    return tag;
  }).replace(BREAK_TAG_RE, (_m, secs) => {
    const n = Number(secs);
    if (n >= 2) return "\n\n... [pause] ... [pause] ...\n\n";
    if (n >= 1) return " ... [pause] ... ";
    return " ... ";
  });
}

function cartesiaEmotion(tag: string): string {
  const t = tag.toLowerCase();
  if (t === "[softly]") return `<emotion value="calm"/><volume ratio="0.85"/>`;
  if (t === "[warmly]" || t === "[tenderly]") return `<emotion value="content"/>`;
  if (t === "[sad]" || t === "[emotional]") return `<emotion value="sad"/>`;
  if (t === "[thoughtfully]") return `<emotion value="calm"/><speed ratio="0.9"/>`;
  if (t === "[hopeful]" || t === "[excited]") return `<emotion value="content"/>`;
  if (t === "[whispers]") return `<volume ratio="0.6"/><speed ratio="0.9"/>`;
  if (t === "[sighs]" || t === "[exhales]") return `<break time="0.6s"/>`;
  if (t === "[laughs softly]") return `[laughter]`;
  if (t === "[pause]") return `<break time="1s"/>`;
  return " ";
}

function compileCartesia(script: string): string {
  const paragraphs = script.split(/\n\n+/);
  return paragraphs
    .map((p) => {
      const body = p.replace(BRACKET_TAG_RE, (tag) => cartesiaEmotion(tag));
      return `<volume ratio="1.0"/><speed ratio="1.0"/> ${body}`.replace(/[ \t]{2,}/g, " ").trim();
    })
    .join("\n\n");
}

function stripAllDirectives(script: string): string {
  return script
    .replace(BRACKET_TAG_RE, " ")
    .replace(ANGLE_TAG_RE, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/**
 * Compile the canonical script into the exact string for the TTS / HeyGen
 * provider. Throws VoiceCompileError if validation fails.
 */
export function compileForVoice(script: string, profile: VoiceProfile): string {
  const validation = validateScriptForVoice(script, profile);
  if (!validation.ok) throw new VoiceCompileError(validation.badTags);

  switch (profile.provider) {
    case "elevenlabs":
      return convertBreaksForEleven(script).trim();
    case "heygen":
      return script.trim();
    case "cartesia":
      return compileCartesia(script);
    case "local":
    case "uploaded":
    default:
      return stripAllDirectives(script);
  }
}

export function estimateScriptStats(script: string): {
  characters: number;
  breaks: number;
  tags: number;
  estimatedSeconds: number;
} {
  const breaks = [...script.matchAll(BREAK_TAG_RE)].length;
  const tags = (script.match(BRACKET_TAG_RE) ?? []).length;
  const plain = stripAllDirectives(script);
  const characters = plain.length;
  const estimatedSeconds = Math.round(characters / 14 + breaks * 1.2);
  return { characters, breaks, tags, estimatedSeconds };
}
