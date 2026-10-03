import fs from "fs";
import os from "os";
import path from "path";
import { runFfmpeg } from "../audio/ffmpegUtils";
import { ensureLocalFile, persistRenderLocalFirst, workingFilePath } from "../storage";
import { Storyboard, allShots } from "./types";

/**
 * Quick mode stitches the storyboard assets under the narration.
 * A shot with no asset stops the render. It does not invent a picture.
 */
export async function assembleQuickVideo(args: {
  channelId: string;
  board: Storyboard;
  narrationRef: string;
}): Promise<{ renderRef: string; localAbsolutePath: string | null; uploadWarning: string | null }> {
  const shots = allShots(args.board).slice().sort((a, b) => a.startSec - b.startSec);
  const missing = shots.filter((shot) => !shot.assetRef);
  if (missing.length) {
    const labels = missing.slice(0, 6).map((shot) => `${shot.index} ${shot.visualType}`).join(", ");
    throw new Error(`Quick render needs an asset on every shot. Missing: ${labels}`);
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vmm-storyboard-"));
  const clips: string[] = [];
  try {
    for (const shot of shots) {
      const duration = Math.max(0.4, shot.endSec - shot.startSec);
      const still = await ensureLocalFile(args.channelId, shot.assetRef!, `${shot.id}.png`);
      const clip = path.join(dir, `${shot.id}.mp4`);
      const frames = Math.max(8, Math.round(duration * 30));
      const held = /still|locked|none/i.test(shot.motion) || shot.visualType === "black" || shot.visualType === "location-card" || shot.visualType === "text-only";
      const zoom = held ? "1" : "min(zoom+0.0005,1.06)";
      await runFfmpeg("ffmpeg", [
        "-y",
        "-loop",
        "1",
        "-i",
        still,
        "-vf",
        `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=30,format=yuv420p`,
        "-t",
        duration.toFixed(3),
        "-an",
        clip,
      ]);
      clips.push(clip);
    }

    const list = path.join(dir, "list.txt");
    fs.writeFileSync(list, clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"));
    const silent = path.join(dir, "silent.mp4");
    await runFfmpeg("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", silent]);

    const narration = await ensureLocalFile(args.channelId, args.narrationRef, "narration.wav");
    const outName = `${args.board.videoProjectId}-storyboard.mp4`;
    const outLocal = workingFilePath(args.channelId, "render", outName);
    await runFfmpeg("ffmpeg", [
      "-y",
      "-i",
      silent,
      "-i",
      narration,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-shortest",
      outLocal,
    ]);
    const saved = await persistRenderLocalFirst(outLocal, args.channelId, outName);
    return {
      renderRef: saved.ref,
      localAbsolutePath: saved.localAbsolutePath,
      uploadWarning: saved.uploadWarning,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
