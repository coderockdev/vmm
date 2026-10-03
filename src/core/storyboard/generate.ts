import { randomUUID } from "crypto";
import { Channel } from "../types";
import { ScriptLine } from "../types";
import { fetchWithRetry, describeProviderError } from "../httpRetry";
import {
  MusicAction,
  MusicMood,
  RenderMode,
  SfxPreset,
  Storyboard,
  StoryboardScene,
  StoryboardShot,
  VISUAL_TYPES,
  VisualType,
  VoiceEffect,
  isVisualType,
} from "./types";

const MODEL = process.env.OPENAI_SCRIPT_MODEL?.trim() && /mini/i.test(process.env.OPENAI_SCRIPT_MODEL)
  ? process.env.OPENAI_SCRIPT_MODEL.trim()
  : "gpt-4o-mini";

interface DraftShot {
  narration?: string;
  visualType?: string;
  visual?: string;
  imagePrompt?: string;
  motion?: string;
  suggestedSec?: number;
  sfx?: Array<{ preset?: string; fileHint?: string; startSec?: number; endSec?: number }>;
  musicMood?: string;
  musicAction?: string;
  silenceSec?: number;
  onScreenText?: string;
  transition?: string;
  locationCard?: { lines?: string[]; coordinates?: string | null } | null;
  map?: {
    mapType?: string;
    startLabel?: string;
    endLabel?: string;
    stops?: string[];
    camera?: string;
    animateRoute?: boolean;
    labels?: boolean;
  } | null;
  speech?: Array<{
    text?: string;
    speakerId?: string;
    speakerName?: string;
    voiceId?: string | null;
    emotion?: string | null;
    delivery?: string | null;
    voiceEffect?: string;
  }>;
}

interface DraftScene {
  title?: string;
  shots?: DraftShot[];
}

const MOODS = new Set(["none", "mystery", "investigation", "tension", "discovery", "danger", "revelation", "aftermath"]);
const ACTIONS = new Set(["start", "continue", "fade", "stop"]);
const EFFECTS = new Set(["none", "radio", "telephone", "distant", "muffled", "echo", "intercom", "cassette", "old-recording"]);
const SFX = new Set([
  "none", "radio-static", "wind", "rain", "footsteps", "engine", "door", "telephone",
  "camera", "paper", "electrical-hum", "insects", "thunder", "custom",
]);

function asMood(value: string | undefined): MusicMood {
  return value && MOODS.has(value) ? (value as MusicMood) : "none";
}
function asAction(value: string | undefined): MusicAction {
  return value && ACTIONS.has(value) ? (value as MusicAction) : "continue";
}
function asEffect(value: string | undefined): VoiceEffect {
  return value && EFFECTS.has(value) ? (value as VoiceEffect) : "none";
}
function asSfx(value: string | undefined): SfxPreset {
  return value && SFX.has(value) ? (value as SfxPreset) : "custom";
}

function spokenFrom(draft: DraftShot, narration: string): StoryboardShot["speech"] {
  const rows = Array.isArray(draft.speech) && draft.speech.length > 0 ? draft.speech : [{ text: narration }];
  return rows.map((row) => ({
    text: String(row.text ?? narration).trim(),
    speakerId: String(row.speakerId || "narrator"),
    speakerName: String(row.speakerName || "Narrador"),
    voiceId: row.voiceId ?? null,
    emotion: row.emotion ?? null,
    delivery: row.delivery ?? null,
    voiceEffect: asEffect(row.voiceEffect),
  }));
}

export function draftToShot(draft: DraftShot, startSec: number, endSec: number): StoryboardShot {
  const visualType: VisualType = draft.visualType && isVisualType(draft.visualType) ? draft.visualType : "cinematic-image";
  const narration = String(draft.narration ?? "").trim();
  const lines = (draft.locationCard?.lines ?? []).map((line) => String(line).trim()).filter(Boolean);
  return {
    id: randomUUID(),
    index: 1,
    startSec,
    endSec,
    narration,
    speech: spokenFrom(draft, narration),
    visualType,
    visual: String(draft.visual ?? "").trim(),
    imagePrompt: String(draft.imagePrompt ?? "").trim(),
    motion: String(draft.motion ?? "Slow push-in.").trim(),
    sfx: (draft.sfx ?? [])
      .filter((cue) => cue && cue.preset !== "none")
      .map((cue) => ({
        id: randomUUID(),
        preset: asSfx(cue.preset),
        fileHint: cue.fileHint ? String(cue.fileHint) : null,
        startSec: Math.max(0, Number(cue.startSec) || 0),
        endSec: Math.max(Number(cue.startSec) || 0, Number(cue.endSec) || 0),
      })),
    musicMood: asMood(draft.musicMood),
    musicAction: asAction(draft.musicAction),
    silenceSec: Math.max(0, Number(draft.silenceSec) || 0),
    onScreenText: String(draft.onScreenText ?? "").trim(),
    transition: draft.transition === "fade" || draft.transition === "black" ? draft.transition : "cut",
    locationCard: visualType === "location-card" ? { lines, coordinates: draft.locationCard?.coordinates ?? null } : null,
    map:
      visualType === "map" && draft.map
        ? {
            mapType: draft.map.mapType === "region" ? "region" : "route",
            startLabel: String(draft.map.startLabel ?? ""),
            endLabel: String(draft.map.endLabel ?? ""),
            stops: Array.isArray(draft.map.stops) ? draft.map.stops.map(String) : [],
            camera: String(draft.map.camera ?? "hold"),
            animateRoute: draft.map.animateRoute !== false,
            labels: draft.map.labels !== false,
          }
        : null,
    status: "planned",
    assetRef: null,
    error: null,
  };
}

/** Scale the model's suggested lengths onto the real narration clock. */
export function lockShotsToDuration(shots: Array<{ draft: DraftShot }>, durationSec: number): StoryboardShot[] {
  const weights = shots.map((shot) => {
    const suggested = Number(shot.draft.suggestedSec);
    if (Number.isFinite(suggested) && suggested > 0) return Math.min(22, Math.max(2, suggested));
    return 8;
  });
  const sum = weights.reduce((total, weight) => total + weight, 0) || 1;
  const scale = durationSec / sum;
  let cursor = 0;
  return shots.map((shot, index) => {
    const span = index === shots.length - 1 ? Math.max(0.4, durationSec - cursor) : Math.max(0.4, weights[index] * scale);
    const start = cursor;
    const end = Math.min(durationSec, start + span);
    cursor = end;
    return draftToShot(shot.draft, start, end);
  });
}

function groupLines(lines: ScriptLine[], durationSec: number): StoryboardShot[] {
  const usable = lines.filter((line) => line.text.trim());
  if (usable.length === 0) {
    return [draftToShot({ narration: "", visual: "Black.", visualType: "black", suggestedSec: durationSec }, 0, durationSec)];
  }
  const drafts: DraftShot[] = [];
  let bucket: ScriptLine[] = [];
  const flush = () => {
    if (bucket.length === 0) return;
    const text = bucket.map((line) => line.text.trim()).join(" ");
    const chars = text.length;
    const suggestedSec = chars < 40 ? 4 : chars < 140 ? 8 : 12;
    drafts.push({
      narration: text,
      visualType: chars < 28 ? "close-up" : "cinematic-image",
      visual: text.slice(0, 180),
      imagePrompt: "",
      suggestedSec,
      musicMood: "mystery",
      musicAction: drafts.length === 0 ? "start" : "continue",
    });
    bucket = [];
  };
  for (const line of usable) {
    bucket.push(line);
    const text = bucket.map((item) => item.text).join(" ");
    if (text.length > 180 || bucket.length >= 3) flush();
  }
  flush();
  return lockShotsToDuration(drafts.map((draft) => ({ draft })), durationSec);
}

function ensureClock(lines: ScriptLine[], durationSec: number): ScriptLine[] {
  if (lines.length === 0) return lines;
  const span = (lines[lines.length - 1]?.end ?? 0) - (lines[0]?.start ?? 0);
  if (span > 1 && span > durationSec * 0.5) return lines;
  const weights = lines.map((line) => Math.max(1, line.text.trim().length));
  const sum = weights.reduce((total, weight) => total + weight, 0) || 1;
  let cursor = 0;
  return lines.map((line, index) => {
    const start = cursor;
    const end = index === lines.length - 1 ? durationSec : cursor + (weights[index] / sum) * durationSec;
    cursor = end;
    return { ...line, start, end };
  });
}

function chunkLines(lines: ScriptLine[], windowSec: number): ScriptLine[][] {
  const chunks: ScriptLine[][] = [];
  let current: ScriptLine[] = [];
  let origin = lines[0]?.start ?? 0;
  for (const line of lines) {
    if (current.length > 0 && line.start - origin >= windowSec) {
      chunks.push(current);
      current = [];
      origin = line.start;
    }
    current.push(line);
  }
  if (current.length) chunks.push(current);
  return chunks.length ? chunks : [lines];
}

async function completeJson(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");
  const response = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 8000,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(describeProviderError(`ChatGPT (modelo "${MODEL}")`, response.status, body));
  }
  const json = await response.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error("The storyboard model returned an empty plan.");
  return text;
}

function parseScenes(text: string): DraftScene[] {
  const parsed = JSON.parse(text) as { scenes?: DraftScene[] };
  if (!Array.isArray(parsed.scenes)) throw new Error("Storyboard JSON has no scenes.");
  return parsed.scenes.filter((scene) => Array.isArray(scene.shots) && scene.shots.length > 0);
}

function promptForChunk(args: {
  channel: Channel;
  title: string;
  durationSec: number;
  lines: ScriptLine[];
  scriptExcerpt: string;
}): string {
  const timed = args.lines
    .map((line) => `${line.start.toFixed(1)}–${line.end.toFixed(1)}  ${line.text.replace(/\s+/g, " ").trim()}`)
    .join("\n");
  return `You are directing a YouTube investigation. Return JSON only.

Channel: ${args.channel.name}
Language of narration and on-screen text: ${args.channel.dna.language === "pt" ? "Brazilian Portuguese" : args.channel.dna.language}
Description: ${args.channel.dna.description}
Avoid: ${args.channel.dna.avoid.join("; ")}
Episode: ${args.title}
Full narration length: ${args.durationSec.toFixed(1)} seconds
This chunk is only the lines below. Direct THIS chunk. Do not cover the rest of the episode.

${args.channel.dna.scriptRules.generationPrompt.slice(0, 2500)}

NARRATION WITH TIMESTAMPS (seconds):
${timed}

SCRIPT EXCERPT (obey its production tags when they fall inside this chunk):
${args.scriptExcerpt.slice(0, 1800)}

RULES
- Direct the episode. Do not cut one image every equal number of seconds.
- Suggested lengths: establishing 8–12s, tense close-up 3–5s, map 10–20s, document 8–15s, location card 3–6s, a quiet hold may be 15s, a reveal may be several short shots.
- Obey [VISUAL], [LOCATION CARD], [SFX], [MAP], [SILENCE] and [MUSIC] tags already in the script.
- One narrator voice. Other people are reported by the narrator, or quoted with speakerId still "narrator" unless the voice is a radio (voiceEffect "radio").
- Location cards are native. Put the lines in locationCard.lines. No image prompt for them.
- Black screens and text-only shots need no image prompt.
- Every other shot needs an imagePrompt in English that describes the real place. No text inside the image.
- visualType must be one of: ${VISUAL_TYPES.join(", ")}
- musicMood: none, mystery, investigation, tension, discovery, danger, revelation, aftermath
- musicAction: start, continue, fade, stop
- silenceSec is a creative hold, in seconds, often 0.
- sfx presets: radio-static, wind, rain, footsteps, engine, door, telephone, camera, paper, electrical-hum, insects, thunder, custom
- sfx startSec and endSec are relative to the shot, not the whole episode. Do not run an effect for the whole shot unless the story needs it.

JSON shape:
{"scenes":[{"title":"SHORT LABEL","shots":[{"narration":"spoken words in this shot","visualType":"cinematic-image","visual":"what we see","imagePrompt":"","motion":"","suggestedSec":8,"sfx":[{"preset":"radio-static","fileHint":"radio_static.wav","startSec":0,"endSec":3}],"musicMood":"mystery","musicAction":"continue","silenceSec":0,"onScreenText":"","transition":"cut","locationCard":null,"map":null,"speech":[{"text":"","speakerId":"narrator","speakerName":"Narrador","voiceId":null,"emotion":null,"delivery":null,"voiceEffect":"none"}]}]}]}`;
}

export async function generateStoryboard(args: {
  channel: Channel;
  videoProjectId: string;
  title: string;
  lines: ScriptLine[];
  durationSec: number;
  renderMode?: RenderMode;
  scriptText?: string;
}): Promise<Storyboard> {
  const durationSec = Math.max(1, args.durationSec);
  const lines = ensureClock(args.lines.filter((line) => line.text.trim()), durationSec);
  const chunks = chunkLines(lines, 150);
  const scenes: StoryboardScene[] = [];
  let directed = true;

  for (const chunk of chunks) {
    const chunkDuration = Math.max(1, (chunk[chunk.length - 1]?.end ?? 0) - (chunk[0]?.start ?? 0));
    try {
      const text = await completeJson(
        promptForChunk({
          channel: args.channel,
          title: args.title,
          durationSec,
          lines: chunk,
          scriptExcerpt: args.scriptText ?? "",
        })
      );
      const parsed = parseScenes(text);
      const drafts = parsed.flatMap((scene) =>
        (scene.shots ?? []).map((shot) => ({ draft: shot, title: scene.title || "SCENE" }))
      );
      if (drafts.length === 0) throw new Error("empty");
      const placed = lockShotsToDuration(
        drafts.map((item) => ({ draft: item.draft })),
        chunkDuration
      );
      const offset = chunk[0]?.start ?? 0;
      let cursorTitle = "";
      let bucket: StoryboardShot[] = [];
      const flush = (title: string) => {
        if (!bucket.length) return;
        scenes.push({ id: randomUUID(), index: scenes.length + 1, title: title || "SCENE", shots: bucket });
        bucket = [];
      };
      placed.forEach((shot, index) => {
        const title = String(drafts[index]?.title || "SCENE").slice(0, 48);
        if (cursorTitle && title !== cursorTitle) flush(cursorTitle);
        cursorTitle = title;
        bucket.push({ ...shot, startSec: shot.startSec + offset, endSec: shot.endSec + offset });
      });
      flush(cursorTitle);
    } catch {
      directed = false;
      const fallback = groupLines(chunk, chunkDuration);
      const offset = chunk[0]?.start ?? 0;
      scenes.push({
        id: randomUUID(),
        index: scenes.length + 1,
        title: "SCENE",
        shots: fallback.map((shot) => ({ ...shot, startSec: shot.startSec + offset, endSec: shot.endSec + offset })),
      });
    }
  }

  if (scenes.length === 0) {
    scenes.push({
      id: randomUUID(),
      index: 1,
      title: "SCENE",
      shots: groupLines(lines, durationSec),
    });
  }

  const now = new Date().toISOString();
  const board: Storyboard = {
    videoProjectId: args.videoProjectId,
    channelId: args.channel.id,
    title: args.title,
    renderMode: args.renderMode ?? "quick",
    status: "draft",
    durationSec,
    scenes,
    createdAt: now,
    updatedAt: now,
  };
  const placed = board.scenes.flatMap((scene) => scene.shots).sort((a, b) => a.startSec - b.startSec);
  if (placed.length > 0) {
    placed[0].startSec = 0;
    placed[placed.length - 1].endSec = durationSec;
  }

  if (!directed) {
    const first = board.scenes[0]?.shots[0];
    if (first && !first.error) first.error = "Part of this board was paced from the narration because the model plan was incomplete. Edit before approving.";
  }
  return board;
}

export async function regenerateShotVisual(args: {
  channel: Channel;
  shot: StoryboardShot;
  neighbor: string;
}): Promise<Partial<StoryboardShot>> {
  const text = await completeJson(`Rewrite ONE storyboard shot. JSON only: {"shot":{...same fields as a shot...}}
Channel: ${args.channel.name}
Keep the narration and the timecodes. Change the picture, the type, the motion, and the sound if the narration asks for it.
Neighbor context: ${args.neighbor}
Current narration: ${args.shot.narration}
visualType must be one of: ${VISUAL_TYPES.join(", ")}`);
  const parsed = JSON.parse(text) as { shot?: DraftShot };
  if (!parsed.shot) throw new Error("The model did not return a shot.");
  const next = draftToShot(parsed.shot, args.shot.startSec, args.shot.endSec);
  return {
    visualType: next.visualType,
    visual: next.visual,
    imagePrompt: next.imagePrompt,
    motion: next.motion,
    sfx: next.sfx,
    musicMood: next.musicMood,
    musicAction: next.musicAction,
    silenceSec: next.silenceSec,
    onScreenText: next.onScreenText,
    transition: next.transition,
    locationCard: next.locationCard,
    map: next.map,
    speech: next.speech.length ? next.speech : args.shot.speech,
    status: "planned",
    assetRef: null,
    error: null,
  };
}
