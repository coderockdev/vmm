import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { getChannel } from "../repo/channels";
import { getVideoProject } from "../repo/projects";
import { writeProjectPublish } from "../repo/projectPublish";
import { ensureLocalFile } from "../storage";
import { getYoutubeClientForChannel } from "./client";
import {
  mapYoutubeApiError,
  YoutubeAuthError,
  YoutubeQuotaError,
  expectedYoutubeChannelIdForVmm,
} from "./oauth";
import { sanitizeYoutubeDescription, sanitizeYoutubeTitle, studioEditUrl } from "./upload";

export type PublishProjectResult = {
  videoId: string;
  studioUrl: string;
  title: string;
  thumbnailOk: boolean;
  thumbnailError?: string;
  youtubeChannelId: string;
  youtubeChannelTitle: string;
};

/**
 * Upload a finished VMM project to YouTube (private):
 * title = headline, description = youtubeDescription, media = render, optional thumb.
 * No category / tags / public — Studio finishes that.
 */
export async function publishProjectToYoutube(args: {
  channelId: string;
  projectId: string;
  onProgress?: (message: string) => void | Promise<void>;
}): Promise<PublishProjectResult> {
  const channel = await getChannel(args.channelId);
  if (!channel) throw new Error("Canal não encontrado");

  const project = await getVideoProject(args.projectId);
  if (!project) throw new Error("Projeto não encontrado");
  if (!project.renderPath) {
    throw new Error("Sem vídeo renderizado — gera o vídeo antes de subir ao YouTube.");
  }

  await args.onProgress?.("A preparar upload YouTube…");

  const { youtube, account } = await getYoutubeClientForChannel(args.channelId);

  // Hard check: token must belong to the expected YouTube channel (Amor Amor pin).
  const expected = expectedYoutubeChannelIdForVmm(args.channelId);
  const mine = await youtube.channels.list({ part: ["snippet"], mine: true });
  const live = mine.data.items?.[0];
  const liveId = live?.id || "";
  const liveTitle = live?.snippet?.title || account.title;
  if (!liveId) {
    throw new YoutubeAuthError("Token sem canal YouTube — volta a Conectar YouTube.");
  }
  if (expected && liveId !== expected) {
    throw new YoutubeAuthError(
      `Conta ligada é «${liveTitle}» (${liveId}), não Amor Amor (${expected}). Desliga e conecta com @amoramor333.`
    );
  }
  if (account.youtubeChannelId && liveId !== account.youtubeChannelId) {
    throw new YoutubeAuthError(
      `Token aponta para «${liveTitle}» (${liveId}) mas o VMM guardou ${account.youtubeChannelId}. Reconecta YouTube.`
    );
  }

  await args.onProgress?.(
    `Upload para «${liveTitle}» (${liveId.slice(0, 8)}…) — privado`
  );

  const title = sanitizeYoutubeTitle(project.headline || project.title);
  const description = sanitizeYoutubeDescription(project.youtubeDescription || "");

  const videoLocal = await ensureLocalFile(
    channel.id,
    project.renderPath,
    `yt-upload-${project.id}${path.extname(project.renderPath) || ".mp4"}`
  );
  if (!fs.existsSync(videoLocal)) {
    throw new Error(`Ficheiro de vídeo não encontrado: ${videoLocal}`);
  }

  await args.onProgress?.(`A enviar «${title.slice(0, 40)}…» para YouTube (privado)…`);

  let videoId: string;
  try {
    const res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title,
          description,
        },
        status: {
          privacyStatus: "private",
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(videoLocal) as unknown as Readable,
      },
    });
    videoId = res.data.id || "";
    if (!videoId) throw new Error("YouTube não devolveu videoId");
  } catch (err) {
    throw mapYoutubeApiError(err);
  }

  let thumbnailOk = false;
  let thumbnailError: string | undefined;

  if (project.thumbnailRef) {
    try {
      await args.onProgress?.("A enviar capa…");
      const thumbLocal = await ensureLocalFile(
        channel.id,
        project.thumbnailRef,
        `yt-thumb-${project.id}${path.extname(project.thumbnailRef) || ".png"}`
      );
      let buf = fs.readFileSync(thumbLocal);
      let mime = /\.png$/i.test(thumbLocal) ? "image/png" : "image/jpeg";
      if (buf.length > 2 * 1024 * 1024) {
        // YouTube rejects thumbs > 2 MB — compress to JPEG ≤1280px.
        const { spawnSync } = await import("child_process");
        const outJpg = path.join(
          path.dirname(thumbLocal),
          `yt-thumb-${project.id}-compressed.jpg`
        );
        const ff = process.env.FFMPEG_PATH?.trim() || "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";
        const argsFf = ["-y", "-i", thumbLocal, "-vf", "scale='min(1280,iw)':-2", "-q:v", "5", outJpg];
        const run = spawnSync(ff, argsFf, { encoding: "utf8" });
        if (run.status === 0 && fs.existsSync(outJpg)) {
          buf = fs.readFileSync(outJpg);
          mime = "image/jpeg";
        }
        if (buf.length > 2 * 1024 * 1024) {
          throw new Error("Capa > 2 MB — YouTube rejeita (compressão falhou)");
        }
      }
      await youtube.thumbnails.set({
        videoId,
        media: {
          mimeType: mime,
          body: Readable.from(buf),
        },
      });
      thumbnailOk = true;
    } catch (err) {
      const mapped = mapYoutubeApiError(err);
      thumbnailError =
        mapped instanceof YoutubeAuthError || mapped instanceof YoutubeQuotaError
          ? mapped.message
          : mapped.message || String(err);
      // Video stays uploaded
    }
  }

  const studioUrl = studioEditUrl(videoId);
  writeProjectPublish(project.id, {
    youtubeVideoId: videoId,
    youtubeUrl: studioUrl,
    youtubeUploadedAt: new Date().toISOString(),
  });

  try {
    const { insertUsageEvent } = await import("../repo/usage");
    await insertUsageEvent({
      channelId: args.channelId,
      contentIdeaId: project.contentIdeaId,
      videoProjectId: project.id,
      stage: "youtube",
      snapshot: {
        provider: "youtube",
        model: "data-api-v3",
        // videos.insert ≈ 1600 units; thumbnails.set ≈ 50. No USD charge.
        quotaUnits: thumbnailOk ? 1650 : 1600,
        durationSeconds: project.renderDurationSeconds ?? null,
        raw: {
          videoId,
          thumbnailOk,
          privacyStatus: "private",
          quotaNote: "YouTube Data API: free daily quota (no $). Upload ≈1600 units.",
        },
      },
    });
  } catch {
    // cost logging must never block upload success
  }

  await args.onProgress?.(
    thumbnailOk
      ? `YouTube OK (privado) · ${studioUrl}`
      : `YouTube OK (privado, capa pendente) · ${studioUrl}`
  );

  return { videoId, studioUrl, title, thumbnailOk, thumbnailError, youtubeChannelId: liveId, youtubeChannelTitle: liveTitle };
}
