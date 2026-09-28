import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { renderMediaOnLambda, getRenderProgress, presignUrl } from "@remotion/lambda/client";
import { AwsRegion } from "@remotion/lambda";
import { NeonMeditationProps } from "../../remotion/NeonMeditationComposition";
import { channelRendersDir } from "../paths";
import { RenderVideoArgs, RenderVideoResult } from "./renderTypes";

function getConfig() {
  const region = (process.env.REMOTION_AWS_REGION as AwsRegion) || "us-east-1";
  const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
  const serveUrl = process.env.REMOTION_LAMBDA_SERVE_URL;
  const bucketName = process.env.REMOTION_LAMBDA_BUCKET;
  const accessKeyId = process.env.REMOTION_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
  if (!functionName || !serveUrl || !bucketName) {
    throw new Error(
      "RENDER_PROVIDER=lambda requires REMOTION_LAMBDA_FUNCTION_NAME, REMOTION_LAMBDA_SERVE_URL and REMOTION_LAMBDA_BUCKET in .env.local."
    );
  }
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "RENDER_PROVIDER=lambda requires REMOTION_AWS_ACCESS_KEY_ID and REMOTION_AWS_SECRET_ACCESS_KEY in .env.local."
    );
  }
  return { region, functionName, serveUrl, bucketName, accessKeyId, secretAccessKey };
}

export async function renderVideoProjectLambda(args: RenderVideoArgs): Promise<RenderVideoResult> {
  const { channel, videoProjectId, lines, seed, durationInSeconds, format, audioAbsolutePath } = args;
  const { region, functionName, serveUrl, bucketName, accessKeyId, secretAccessKey } = getConfig();

  // Remotion's own renderMediaOnLambda/getRenderProgress read REMOTION_AWS_*
  // internally, but a plain S3Client only honors the standard AWS_* names —
  // pass credentials explicitly or it falls through the default provider
  // chain and fails with "Could not load credentials from any providers".
  const s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
  let audioObjectKey: string | null = null;
  let audioUrl: string | null = null;

  try {
    if (audioAbsolutePath) {
      audioObjectKey = `audio-uploads/${videoProjectId}${path.extname(audioAbsolutePath)}`;
      args.onProgress?.(8, "Enviando áudio para a nuvem...");
      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: audioObjectKey,
          Body: fs.readFileSync(audioAbsolutePath),
          ContentType: "audio/mpeg",
        })
      );
      audioUrl = await presignUrl({
        region,
        bucketName,
        objectKey: audioObjectKey,
        expiresInSeconds: 3600,
      });
    }

    const compositionId = format === "short" ? "NeonMeditationShort" : "NeonMeditationVideo";
    const inputProps: NeonMeditationProps = {
      lines,
      paletteId: channel.dna.visual.palette,
      textPreset: channel.dna.visual.textPreset,
      seed,
      durationInSeconds,
      audioFileName: audioUrl, // full https URL — composition treats this as an absolute src
    };

    args.onProgress?.(15, "Disparando renders na Lambda...");
    const { renderId, bucketName: outBucket } = await renderMediaOnLambda({
      region,
      functionName,
      serveUrl,
      composition: compositionId,
      inputProps,
      codec: "h264",
      privacy: "public",
      framesPerLambda: 900, // keeps concurrent invocations low while the AWS account is new/rate-limited
    });

    let outputUrl: string | null = null;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await new Promise((r) => setTimeout(r, 3000));
      const progress = await getRenderProgress({ renderId, bucketName: outBucket, functionName, region });

      if (progress.fatalErrorEncountered) {
        throw new Error(
          `Lambda render failed: ${progress.errors.map((e) => e.message).join("; ") || "unknown error"}`
        );
      }

      const pct = 15 + Math.round(progress.overallProgress * 80);
      args.onProgress?.(Math.max(15, Math.min(95, pct)), "Renderizando na Lambda...");

      if (progress.done) {
        outputUrl = progress.outputFile;
        break;
      }
    }

    if (!outputUrl) throw new Error("Lambda render finished without an output file.");

    args.onProgress?.(96, "Baixando resultado...");
    const outputDir = channelRendersDir(channel.id);
    const outputPath = path.join(outputDir, `${videoProjectId}.mp4`);
    const response = await fetch(outputUrl);
    if (!response.ok) throw new Error(`Failed to download rendered video: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));

    args.onProgress?.(98, "Finalizando...");
    return {
      outputPath,
      relativeRenderPath: path.join("renders", `${videoProjectId}.mp4`),
      durationSeconds: durationInSeconds,
    };
  } finally {
    if (audioObjectKey) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: audioObjectKey })).catch(() => {});
    }
  }
}
