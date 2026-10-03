import { Channel } from "../types";
import { OpenAIImageProvider } from "../providers/image/OpenAIImageProvider";
import { stillImageRequest } from "../providers/image/stillChoices";
import { persistFile, workingFilePath } from "../storage";
import { Storyboard, StoryboardShot, needsGeneratedImage } from "./types";
import { locationCardStyle, renderLocationCardPng, renderMapPng, renderTextCardPng } from "./cards";

const IMAGE_BATCH = 6;

function fileName(projectId: string, shotId: string): string {
  return `sb-${projectId.slice(0, 8)}-${shotId.slice(0, 8)}.png`;
}

async function storePng(channelId: string, projectId: string, shotId: string, localPath: string): Promise<string> {
  return persistFile(localPath, channelId, "cover", fileName(projectId, shotId), "image/png");
}

async function nativeCard(
  channel: Channel,
  board: Storyboard,
  shot: StoryboardShot
): Promise<void> {
  const style = locationCardStyle(channel);
  const local = workingFilePath(channel.id, "cover", fileName(board.videoProjectId, shot.id));
  if (shot.visualType === "location-card") {
    const lines = shot.locationCard?.lines?.filter(Boolean) ?? [];
    if (lines.length === 0) throw new Error("Location card has no lines.");
    await renderLocationCardPng({
      outPath: local,
      style,
      card: { lines, coordinates: shot.locationCard?.coordinates ?? null },
    });
  } else if (shot.visualType === "map") {
    if (!shot.map) throw new Error("Map shot has no route.");
    await renderMapPng({ outPath: local, map: shot.map, style });
  } else if (shot.visualType === "black") {
    await renderTextCardPng({ outPath: local, text: shot.onScreenText, style, black: true });
  } else if (shot.visualType === "text-only") {
    await renderTextCardPng({ outPath: local, text: shot.onScreenText || shot.visual, style });
  } else {
    throw new Error(`No native renderer for ${shot.visualType}.`);
  }
  shot.assetRef = await storePng(channel.id, board.videoProjectId, shot.id, local);
  shot.status = "asset-ready";
  shot.error = null;
}

/**
 * Builds only what the approved storyboard already decided.
 * An empty image prompt is a failure, not an invitation to invent one.
 */
export async function generateStoryboardAssets(channel: Channel, board: Storyboard): Promise<{
  board: Storyboard;
  generatedImages: number;
  remainingImages: number;
}> {
  if (board.status !== "approved") {
    throw new Error("Approve the storyboard before generating assets.");
  }
  let budget = IMAGE_BATCH;
  let generatedImages = 0;
  const still = stillImageRequest(channel.dna.visual.stillImage);
  const images = new OpenAIImageProvider();

  for (const scene of board.scenes) {
    for (const shot of scene.shots) {
      if (shot.status === "asset-ready" && shot.assetRef) continue;
      if (shot.visualType === "ai-video" && board.renderMode === "cinematic") {
        shot.status = "planned";
        shot.assetRef = null;
        shot.error = "Cinematic video is not connected yet. The same shot can render as a still in Quick mode.";
        continue;
      }
      try {
        if (!needsGeneratedImage(shot.visualType, board.renderMode)) {
          await nativeCard(channel, board, shot);
          continue;
        }
        if (budget <= 0) continue;
        if (!shot.imagePrompt.trim()) {
          shot.status = "failed";
          shot.error = "This shot has no image prompt. Write one before generating.";
          continue;
        }
        budget -= 1;
        const local = workingFilePath(channel.id, "cover", fileName(board.videoProjectId, shot.id));
        await images.generate({
          prompt: `${shot.imagePrompt}\n\n16:9 documentary frame. No text. No letters. No logo.`,
          outPath: local,
          model: still.model,
          quality: still.quality,
          size: "1536x1024",
        });
        shot.assetRef = await storePng(channel.id, board.videoProjectId, shot.id, local);
        shot.status = "asset-ready";
        shot.error = null;
        generatedImages += 1;
      } catch (error) {
        shot.status = "failed";
        shot.error = error instanceof Error ? error.message : "Asset failed.";
      }
    }
  }

  const remainingImages = board.scenes
    .flatMap((scene) => scene.shots)
    .filter(
      (shot) =>
        needsGeneratedImage(shot.visualType, board.renderMode) &&
        shot.status !== "asset-ready" &&
        shot.status !== "failed" &&
        !shot.assetRef
    ).length;

  return { board, generatedImages, remainingImages };
}
