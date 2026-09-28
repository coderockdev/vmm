import path from "path";
import fs from "fs";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { NeonMeditationProps } from "../../remotion/NeonMeditationComposition";
import { workingFilePath, persistFile, ensureLocalFile } from "../storage";
import { RenderVideoArgs, RenderVideoResult } from "./renderTypes";

export * from "./renderTypes";

const ENTRY_POINT = path.join(process.cwd(), "src", "remotion", "index.ts");
const PUBLIC_DIR = path.join(process.cwd(), "public");

let bundleLocationPromise: Promise<string> | null = null;

function getBundleLocation(): Promise<string> {
  if (!bundleLocationPromise) {
    bundleLocationPromise = bundle({
      entryPoint: ENTRY_POINT,
      publicDir: PUBLIC_DIR,
      onProgress: () => {},
    });
  }
  return bundleLocationPromise;
}

/**
 * RENDER_PROVIDER env var picks the backend. "local" (default) renders on
 * this machine; "lambda" dispatches to AWS Lambda (see renderLambda.ts) —
 * same seam pattern as ScriptProvider/TTSProvider, so runProject.ts never
 * needs to know which one is active.
 */
export async function renderVideoProject(args: RenderVideoArgs): Promise<RenderVideoResult> {
  const provider = process.env.RENDER_PROVIDER ?? "local";
  if (provider === "lambda") {
    const { renderVideoProjectLambda } = await import("./renderLambda");
    return renderVideoProjectLambda(args);
  }
  return renderVideoProjectLocal(args);
}

async function renderVideoProjectLocal(args: RenderVideoArgs): Promise<RenderVideoResult> {
  const { channel, videoProjectId, lines, seed, durationInSeconds, format, audioAbsolutePath } = args;

  let audioFileName: string | null = null;
  let bundleRenderTmpDir: string | null = null;

  try {
    args.onProgress?.(5, "Preparando composição...");
    const bundleLocation = await getBundleLocation();

    // bundle() copies public/ into its own served directory ONCE, at bundle
    // time. Since we cache that bundle across renders (rebundling is slow),
    // per-render audio written to public/ afterwards is invisible to it —
    // it has to be written straight into the already-served bundle dir.
    if (audioAbsolutePath) {
      const localAudioPath = await ensureLocalFile(channel.id, audioAbsolutePath, `narration${path.extname(audioAbsolutePath)}`);
      bundleRenderTmpDir = path.join(bundleLocation, "render-tmp");
      fs.mkdirSync(bundleRenderTmpDir, { recursive: true });
      audioFileName = `${videoProjectId}${path.extname(localAudioPath)}`;
      fs.copyFileSync(localAudioPath, path.join(bundleRenderTmpDir, audioFileName));
    }

    const compositionId = format === "short" ? "NeonMeditationShort" : "NeonMeditationVideo";
    const inputProps: NeonMeditationProps = {
      lines,
      paletteId: channel.dna.visual.palette,
      textPreset: channel.dna.visual.textPreset,
      seed,
      durationInSeconds,
      audioFileName: audioFileName ? `render-tmp/${audioFileName}` : null,
    };

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: compositionId,
      inputProps,
    });

    const renderFileName = `${videoProjectId}.mp4`;
    const outputPath = workingFilePath(channel.id, "render", renderFileName);

    args.onProgress?.(15, "Renderizando...");
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      // This machine's macOS/GPU combo is unreliable with Chromium's default
      // GL backend + parallel tabs — swiftshader + concurrency 1 is what
      // actually renders reliably here (verified via manual CLI testing).
      concurrency: 1,
      chromiumOptions: { gl: "swiftshader" },
      onProgress: ({ progress }) => {
        args.onProgress?.(15 + Math.round(progress * 80), "Renderizando...");
      },
    });

    args.onProgress?.(98, "Finalizando...");
    const ref = await persistFile(outputPath, channel.id, "render", renderFileName, "video/mp4");
    return {
      outputPath,
      relativeRenderPath: ref,
      durationSeconds: durationInSeconds,
    };
  } finally {
    if (audioFileName && bundleRenderTmpDir) {
      fs.rmSync(path.join(bundleRenderTmpDir, audioFileName), { force: true });
    }
  }
}
