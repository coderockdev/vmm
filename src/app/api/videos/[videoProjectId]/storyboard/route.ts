import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../core/repo/channels";
import { completeProjectRender, getAudioAsset, getScript, getVideoProject } from "../../../../../core/repo/projects";
import { generateStoryboard, regenerateShotVisual } from "../../../../../core/storyboard/generate";
import { readStoryboard, writeStoryboard } from "../../../../../core/storyboard/store";
import { generateStoryboardAssets } from "../../../../../core/storyboard/assets";
import { assembleQuickVideo } from "../../../../../core/storyboard/assembleQuick";
import { findShot } from "../../../../../core/storyboard/edit";
import { Storyboard } from "../../../../../core/storyboard/types";

export const maxDuration = 300;

export async function GET(_req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const project = await getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const audio = project.audioAssetId ? await getAudioAsset(project.audioAssetId) : null;
  const script = project.scriptId ? await getScript(project.scriptId) : null;
  const storyboard = await readStoryboard(project.id);
  return NextResponse.json({
    storyboard,
    title: project.title,
    hasScript: Boolean(script),
    hasAudio: Boolean(audio),
    durationSec: audio?.durationSeconds ?? project.renderDurationSeconds ?? project.durationMinutes * 60,
  });
}

export async function POST(req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const project = await getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const channel = await getChannel(project.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  try {
    if (action === "generate") {
      const script = project.scriptId ? await getScript(project.scriptId) : null;
      const audio = project.audioAssetId ? await getAudioAsset(project.audioAssetId) : null;
      if (!script) return NextResponse.json({ error: "The script has to exist first." }, { status: 400 });
      if (!audio) return NextResponse.json({ error: "The narration audio has to exist first. The storyboard is timed to that recording." }, { status: 400 });
      const existing = await readStoryboard(project.id);
      const storyboard = await generateStoryboard({
        channel,
        videoProjectId: project.id,
        title: project.title,
        lines: script.lines,
        durationSec: audio.durationSeconds,
        renderMode: existing?.renderMode ?? "quick",
        scriptText: script.rawText,
      });
      await writeStoryboard(storyboard);
      return NextResponse.json({ storyboard });
    }

    if (action === "save" || action === "approve") {
      const incoming = body.storyboard as Storyboard | undefined;
      if (!incoming) return NextResponse.json({ error: "Missing storyboard." }, { status: 400 });
      incoming.videoProjectId = project.id;
      incoming.channelId = channel.id;
      incoming.status = action === "approve" ? "approved" : "draft";
      const storyboard = await writeStoryboard(incoming);
      return NextResponse.json({ storyboard });
    }

    if (action === "generate-assets") {
      const storyboard = await readStoryboard(project.id);
      if (!storyboard) return NextResponse.json({ error: "Generate a storyboard first." }, { status: 400 });
      const result = await generateStoryboardAssets(channel, storyboard);
      await writeStoryboard(result.board);
      return NextResponse.json(result);
    }

    if (action === "regenerate-shot") {
      const storyboard = await readStoryboard(project.id);
      if (!storyboard) return NextResponse.json({ error: "Generate a storyboard first." }, { status: 400 });
      const shotId = String(body.shotId || "");
      const at = findShot(storyboard, shotId);
      if (!at) return NextResponse.json({ error: "Shot not found." }, { status: 404 });
      const shot = storyboard.scenes[at.sceneIndex].shots[at.shotIndex];
      const neighbor = storyboard.scenes[at.sceneIndex].title;
      const patch = await regenerateShotVisual({ channel, shot, neighbor });
      storyboard.scenes[at.sceneIndex].shots[at.shotIndex] = { ...shot, ...patch, status: "planned", assetRef: null };
      storyboard.status = "draft";
      await writeStoryboard(storyboard);
      return NextResponse.json({ storyboard });
    }

    if (action === "render-quick") {
      const storyboard = await readStoryboard(project.id);
      if (!storyboard) return NextResponse.json({ error: "Generate a storyboard first." }, { status: 400 });
      if (storyboard.status !== "approved") {
        return NextResponse.json({ error: "Approve the storyboard before rendering." }, { status: 400 });
      }
      if (storyboard.renderMode !== "quick") {
        return NextResponse.json({ error: "This board is in Cinematic mode. Switch to Quick to render with today's stills." }, { status: 400 });
      }
      const audio = project.audioAssetId ? await getAudioAsset(project.audioAssetId) : null;
      if (!audio) return NextResponse.json({ error: "Narration audio is missing." }, { status: 400 });
      const saved = await assembleQuickVideo({
        channelId: channel.id,
        board: storyboard,
        narrationRef: audio.filePath,
      });
      await completeProjectRender(project.id, saved.renderRef, storyboard.durationSec);
      return NextResponse.json({ ok: true, ...saved });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Storyboard failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
