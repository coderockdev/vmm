import { NextRequest, NextResponse } from "next/server";
import { listChannels, createChannel, slugify } from "../../../core/repo/channels";
import { ChannelDNA } from "../../../core/types";

export async function GET() {
  return NextResponse.json({ channels: await listChannels() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const dna: ChannelDNA = {
    description: body.description ?? "",
    purpose: body.purpose ?? "",
    audience: body.audience ?? "",
    language: body.language ?? "pt",
    tone: body.tone ?? [],
    topics: body.topics ?? [],
    avoid: body.avoid ?? [],
    scriptRules: {
      opening: body.scriptRules?.opening ?? "abertura direta e envolvente",
      structure:
        body.scriptRules?.structure ?? "introdução → preparação → conteúdo principal → reflexão → encerramento",
      cta: body.scriptRules?.cta ?? "CTA curto e natural quando apropriado",
      defaultDurationMinutes: body.scriptRules?.defaultDurationMinutes ?? 8,
      defaultSceneCount: body.scriptRules?.defaultSceneCount ?? 4,
      generationPrompt: body.scriptRules?.generationPrompt ?? "",
      pauses: {
        betweenLines: body.scriptRules?.pauses?.betweenLines ?? 0.5,
        betweenSections: body.scriptRules?.pauses?.betweenSections ?? 1.5,
      },
      wordsPerMinute: body.scriptRules?.wordsPerMinute ?? 145,
      charsPerWord: body.scriptRules?.charsPerWord ?? 6,
      performanceTags: {
        enabled: body.scriptRules?.performanceTags?.enabled ?? false,
        selected: Array.isArray(body.scriptRules?.performanceTags?.selected)
          ? body.scriptRules.performanceTags.selected
          : [],
        tagsPerThousandWords: body.scriptRules?.performanceTags?.tagsPerThousandWords ?? 35,
      },
    },
    visual: {
      template: "neon-meditation",
      palette: body.visual?.palette ?? "cosmic",
      textPreset: body.visual?.textPreset ?? "bold-scroll",
    },
    voice: {
      provider: body.voice?.provider ?? "local",
      voiceId: body.voice?.voiceId ?? null,
      speed: body.voice?.speed ?? 1,
      volume: body.voice?.volume ?? 1,
    },
    usesScript: body.usesScript ?? true,
    usesNarration: body.usesNarration ?? true,
  };

  const channel = await createChannel({
    id: await slugify(body.name),
    name: body.name,
    niche: body.niche ?? "",
    coverColor: body.coverColor ?? "#ff5a2e",
    dna,
  });

  return NextResponse.json({ channel });
}
