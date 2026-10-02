import fs from "fs";
import path from "path";
import { mixNarrationWithBed } from "../audio/mixNarrationBed";
import { concatAudioFiles, ffprobeDuration, runFfmpeg } from "../audio/ffmpegUtils";
import { LibraryMusicProvider } from "../providers/music";
import { burnStoryCover } from "../providers/image/burnThumbnailText";
import { JULIO_VERNE_INTERIOR_STYLE_RULES } from "../providers/image/coverFormats";
import { getImageProvider } from "../providers/image";
import { CartesiaTTSProvider } from "../providers/tts/CartesiaTTSProvider";
import { chirpBilledCharacters, synthesizeChirpToFile } from "../providers/tts/chirpSpeech";
import { isChirpVoiceId } from "./chirpVoices";
import { freshLog, markPart, packMessage, readLog, type ChapterPartId } from "./chapterLog";
import { splitTextForTts } from "../providers/tts/ttsLimits";
import { getChannel } from "../repo/channels";
import {
  claimQueuedChapter,
  getAudiobookSettings,
  getBook,
  listChaptersForBook,
  patchChapter,
} from "../repo/books";
import { persistFile } from "../storage";
import { insertUsageEvent, recordChirpUsage } from "../repo/usage";
import { setVideoThumbnail, startResumableVideoUpload, putResumableChunk } from "../youtube/upload";
import { ensureChapterAssetDirs } from "./chapterAssets";
import { renderCinematicStill } from "./cinematicMotion";
import { bookSourceDir } from "./paths";
import { planChapterVisuals } from "./visualPlan";

let busy = false;

export async function runNextAudiobookChapter(): Promise<boolean> {
  if (busy) return false;
  const claimed = await claimQueuedChapter();
  if (!claimed) return false;
  busy = true;
  try {
    await produceClaimedChapter(claimed.chapter.id, claimed.mode);
    return true;
  } finally {
    busy = false;
  }
}

async function note(
  chapterId: string,
  status: Parameters<typeof patchChapter>[1]["status"],
  message: string,
  part?: { id: ChapterPartId; percent: number; detail: string; done?: boolean },
  extra?: Parameters<typeof patchChapter>[1]
) {
  const current = await listSafe(chapterId);
  const log = part
    ? markPart(readLog(current?.errorMessage) ?? freshLog(), part.id, part)
    : readLog(current?.errorMessage) ?? freshLog();
  await patchChapter(chapterId, { ...extra, status, errorMessage: packMessage(message, log) });
}

export async function reproduceChapter(chapterId: string): Promise<void> {
  const { getChapter } = await import("../repo/books");
  const current = await getChapter(chapterId);
  if (current) {
    await patchChapter(chapterId, {
      status: "tts_running",
      attempts: current.attempts + 1,
      errorMessage: packMessage(
        `Versão ${current.attempts + 1} · a gerar de novo (imagens do texto, clipes no início, portada só com o título).`,
        freshLog()
      ),
    });
  }
  await produceClaimedChapter(chapterId, "full");
}

export async function resumeChapterMotion(chapterId: string): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    await produceClaimedChapter(chapterId, "full", "motion");
  } finally {
    busy = false;
  }
}

async function produceClaimedChapter(
  chapterId: string,
  mode: "audio" | "full",
  from: "start" | "motion" = "start"
): Promise<void> {
  const chapter = (await listSafe(chapterId)) ?? null;
  if (!chapter) return;
  try {
    const book = await getBook(chapter.bookId);
    if (!book) throw new Error("Obra não encontrada.");
    const channel = await getChannel(book.channelId);
    if (!channel) throw new Error("Canal não encontrado.");
    const settings = await getAudiobookSettings(channel.id);
    const siblings = await listChaptersForBook(book.id);
    const next = siblings.find((item) => item.index === chapter.index + 1) ?? null;

    if (from !== "motion") {
      await note(chapter.id, "tts_running", "Áudio: a ler o texto…", {
        id: "audio",
        percent: 8,
        detail: "A ler o texto",
      });
    }
    const body = readChapterText(book.folder, chapter.sourceFile);
    const spoken = spokenScript(book.title, body, next?.label ?? null);
    const dirs = ensureChapterAssetDirs(channel.id, book.folder, chapter.index);
    const spokenPath = path.join(dirs.timeline, "spoken.txt");
    fs.writeFileSync(spokenPath, spoken, "utf8");
    const existingAudio = path.join(dirs.audio, "narration.mp3");
    const keepAudio =
      from === "motion" && fs.existsSync(existingAudio) && fs.statSync(existingAudio).size > 1000;

    const dnaVoice = channel.dna.voice;
    const dnaChirp = dnaVoice.provider === "google" && isChirpVoiceId(dnaVoice.voiceId ?? "");
    const voiceId = dnaChirp ? dnaVoice.voiceId! : settings.ttsVoice;
    const storedSpeed = dnaChirp ? dnaVoice.speed : settings.ttsSpeakingRate;
    const speed = narrationSpeed(storedSpeed * 1.05);
    const useChirp = dnaChirp || settings.ttsProvider === "google-chirp3-hd";
    const engine = useChirp ? "Chirp" : "Cartesia";
    if (!keepAudio) {
      await note(chapter.id, "tts_running", `Áudio: a narrar com ${engine} (${speed.toFixed(2)})…`, {
        id: "audio",
        percent: 35,
        detail: `A narrar com ${engine}`,
      });
    }
    const audioPath = keepAudio
      ? existingAudio
      : useChirp
        ? await narrateChirp(spoken, voiceId, speed, dirs.audio, channel.id, chapter.id)
        : await narrate(spoken, voiceId, settings.ttsLanguageCode, speed, dirs.audio);
    const audioSec = await ffprobeDuration(audioPath);
    const audioRef = keepAudio
      ? chapter.audioPath || audioPath
      : await persistFile(audioPath, channel.id, "audio", `${chapter.id}.mp3`, "audio/mpeg");
    await note(
      chapter.id,
      mode === "audio" ? "audio_ready" : "tts_running",
      mode === "audio" ? "Áudio pronto." : "Áudio pronto. A planear as imagens…",
      { id: "audio", percent: 100, detail: "Pronto", done: true },
      { audioPath: audioRef, audioDurationSec: audioSec, ttsTextPath: spokenPath }
    );
    if (mode === "audio") return;

    const plan = planChapterVisuals(chapter.words, settings.visualBudget);
    fitSlots(plan.slots, audioSec);
    const style = channel.dna.visual.interiorStyleRules || JULIO_VERNE_INTERIOR_STYLE_RULES;
    const look = visualFacts(body);
    const images: string[] = [];
    for (const image of plan.images) {
      const file = path.join(dirs.images, `${String(image.index + 1).padStart(2, "0")}.png`);
      if (from === "motion" && fs.existsSync(file) && fs.statSync(file).size > 1000) {
        images.push(file);
        continue;
      }
      await note(
        chapter.id,
        "images_ready",
        `Imagens: ${image.index + 1}/${plan.images.length} a partir do texto…`,
        {
          id: "images",
          percent: Math.round((image.index / plan.images.length) * 100),
          detail: `${image.index + 1}/${plan.images.length}`,
        }
      );
      const scene = excerpt(body, image.wordStart, image.wordEnd);
      const made = await generateStill(imagePrompt(style, book.title, scene, look), file);
      await frameTo16x9(file);
      await insertUsageEvent({
        channelId: channel.id,
        stage: "thumbnail",
        snapshot: {
          provider: made === "gemini" ? "gemini" : "openai",
          model: made === "gemini" ? "gemini-3.1-flash-image" : "gpt-image-1 medium 1536x1024",
          images: 1,
          raw: { chapterId: chapter.id, task: "image" },
        },
      }).catch(() => undefined);
      images.push(file);
    }
    await note(chapter.id, "images_ready", "Imagens prontas.", {
      id: "images",
      percent: 100,
      detail: `${images.length} prontas`,
      done: true,
    });

    const clips: string[] = new Array(plan.slots.length);
    const aiSlots = plan.slots.filter((slot) => slot.kind === "ai-clip");
    for (let n = 0; n < aiSlots.length; n++) {
      const slot = aiSlots[n];
      const still = images[slot.imageIndex] ?? images[0];
      const out = path.join(dirs.motion, `slot-${String(slot.index + 1).padStart(2, "0")}.mp4`);
      await note(chapter.id, "images_ready", `Animação: Fal, imagem ${slot.imageIndex + 1}…`, {
        id: "video",
        percent: Math.round((n / Math.max(1, aiSlots.length)) * 100),
        detail: `Fal ${n + 1}/${aiSlots.length}`,
      });
      await tryFalClip(still, motionPrompt(), slot.durationSec, out, channel.id, settings.visualBudget.imageToVideoModel, async (detail) => {
        await note(chapter.id, "images_ready", `Animação: Fal, imagem ${slot.imageIndex + 1}…`, {
          id: "video",
          percent: Math.round((n / Math.max(1, aiSlots.length)) * 100),
          detail: `${n + 1}/${aiSlots.length} · ${detail}`,
        });
      });
      await insertUsageEvent({
        channelId: channel.id,
        stage: "render",
        snapshot: {
          provider: "fal",
          model: `${settings.visualBudget.imageToVideoModel} 720p`,
          images: 1,
          durationSeconds: slot.durationSec,
          raw: { chapterId: chapter.id, task: "animation" },
        },
      }).catch(() => undefined);
      clips[slot.index] = out;
    }

    await note(chapter.id, "images_ready", "Animação pronta. A renderizar…", {
      id: "video",
      percent: 100,
      detail: `${aiSlots.length} clipes`,
      done: true,
    });
    await note(chapter.id, "images_ready", "Renderização: narração e música…", {
      id: "render",
      percent: 20,
      detail: "Áudio",
    });
    const finalPath = path.join(dirs.final, "chapter.mp4");
    const mixedAudio = await underVoice(audioPath, dirs.audio, channel.id, chapter.id);
    const stillSlots = plan.slots.filter((slot) => slot.kind !== "ai-clip");
    for (let n = 0; n < stillSlots.length; n++) {
      const slot = stillSlots[n];
      const still = images[slot.imageIndex] ?? images[0];
      const out = path.join(dirs.motion, `slot-${String(slot.index + 1).padStart(2, "0")}.mp4`);
      await note(chapter.id, "images_ready", "Renderização: câmera sobre a imagem fixa…", {
        id: "render",
        percent: 30 + Math.round((n / Math.max(1, stillSlots.length)) * 20),
        detail: `Câmera ${n + 1}/${stillSlots.length}`,
      });
      await renderCinematicStill({
        imagePath: still,
        outputPath: out,
        motion: slot.motion,
        crop: slot.crop,
        durationSec: slot.durationSec,
        width: 1280,
        height: 720,
      });
      clips[slot.index] = out;
    }
    await note(chapter.id, "images_ready", "Renderização: fades, imagens e áudio…", {
      id: "render",
      percent: 55,
      detail: "Fades",
    });
    await assemble(
      clips,
      plan.slots.map((slot) => slot.kind),
      mixedAudio,
      finalPath
    );
    const videoBytes = fs.statSync(finalPath).size;
    const videoRef =
      videoBytes > 45 * 1024 * 1024
        ? finalPath
        : await persistFile(finalPath, channel.id, "render", `${chapter.id}.mp4`, "video/mp4");
    await note(chapter.id, "video_ready", "Renderização pronta. A fazer a portada…", {
      id: "render",
      percent: 100,
      detail: "Pronto",
      done: true,
    }, { videoPath: videoRef });

    await note(chapter.id, "thumb_ready", "Portada: a pintar o título…", {
      id: "cover",
      percent: 40,
      detail: "A pintar o título",
    });
    const thumbStill = images[plan.thumbnailSourceImage] ?? images[0];
    const thumbPath = path.join(dirs.thumbnails, "cover.png");
    fs.copyFileSync(thumbStill, thumbPath);
    const cover = coverCopy(chapter.label);
    await burnStoryCover(thumbPath, cover.title, cover.author);
    const thumbJpg = await jpegThumb(thumbPath);
    const thumbRef = await persistFile(thumbJpg, channel.id, "thumbnails", `${chapter.id}.jpg`, "image/jpeg");
    await note(chapter.id, "thumb_ready", "Portada pronta. A escrever a descrição…", {
      id: "copy",
      percent: 50,
      detail: "A escrever título e descrição",
    }, { thumbPath: thumbRef });

    await note(chapter.id, "uploading", "YouTube: a enviar o capítulo em privado…", {
      id: "youtube",
      percent: 20,
      detail: "A enviar em privado",
    });
    const title = youtubeTitle(book.title, chapter.label, chapter.index);
    const description = youtubeDescription(book.title, chapter.label, next?.label ?? null);
    const videoId = await uploadPrivate(channel.id, finalPath, title, description);
    await setVideoThumbnail({
      channelId: channel.id,
      videoId,
      buffer: fs.readFileSync(thumbJpg),
      mimeType: "image/jpeg",
    });
    await note(chapter.id, "uploaded", "No YouTube (privado).", {
      id: "youtube",
      percent: 100,
      detail: "Privado",
      done: true,
    }, {
      youtubeVideoId: videoId,
      youtubeUrl: `https://studio.youtube.com/video/${videoId}/edit`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const current = await listSafe(chapterId);
    const quota = /quota/i.test(message);
    await patchChapter(chapterId, {
      status: quota ? "thumb_ready" : "failed",
      errorMessage: packMessage(
        quota
          ? "Portada pronta. O YouTube ficou sem cota hoje. O vídeo está feito; a capa entra amanhã."
          : message.slice(0, 500),
        readLog(current?.errorMessage) ?? freshLog()
      ),
    });
  }
}

async function listSafe(chapterId: string) {
  const { getChapter } = await import("../repo/books");
  return getChapter(chapterId);
}

function readChapterText(folder: string, sourceFile: string): string {
  const file = path.join(bookSourceDir(folder), sourceFile);
  if (!fs.existsSync(file)) {
    throw new Error(
      `Texto não encontrado: ${file}. O pacote julio_verne_capitulos tem de estar em data/books no worker.`
    );
  }
  const text = fs.readFileSync(file, "utf8").trim();
  if (!text) throw new Error("O ficheiro do capítulo está vazio.");
  return text;
}

function narrationSpeed(stored: number): number {
  const value = Number.isFinite(stored) && stored > 0 ? stored : 0.95;
  return Math.min(1.05, Math.max(0.85, value));
}

function spokenScript(bookTitle: string, body: string, nextLabel: string | null): string {
  const story = body
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .filter((paragraph, index) => index > 0 || !isRepeatedHeading(paragraph, bookTitle))
    .join('\n\n<break time="0.7s"/>\n\n');
  const closing = nextLabel
    ? `Fim do capítulo. O próximo é ${nextLabel}. Inscreva-se para acompanhar a obra.`
    : "Fim deste capítulo. Inscreva-se para acompanhar a obra.";
  return `${story}\n\n<break time="0.8s"/>\n\n${closing}`;
}

function isRepeatedHeading(paragraph: string, bookTitle: string): boolean {
  const first = paragraph.split("\n")[0]?.trim() ?? "";
  const fold = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const line = fold(first);
  return line.includes(fold(bookTitle)) || /^capitulo\b/.test(line);
}

function excerpt(text: string, wordStart: number, wordEnd: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  return words.slice(wordStart, Math.max(wordStart + 1, wordEnd)).join(" ").slice(0, 700);
}

/** Sentences that describe a face, clothes, or the house, so every frame keeps the same people. */
function visualFacts(text: string): string {
  const sentences = text
    .split(/(?<=[.!?»])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length > 40 && sentence.length < 420);
  const keys =
    /cabelos|óculos|oculos|olhos azuis|louro|loiro|bengala|punhos fechados|nariz|olmo|empena|meio tijolo|chapéu de pelo|chapeu de pelo/i;
  const rank = (sentence: string) =>
    /cabelos|óculos|oculos|olhos azuis|louro|loiro/.test(sentence) ? 0 : /empena|olmo|tijolo/.test(sentence) ? 1 : 2;
  return sentences
    .filter((sentence) => keys.test(sentence))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 3)
    .join(" ")
    .slice(0, 520);
}

async function generateStill(prompt: string, outPath: string): Promise<"openai" | "gemini"> {
  const quota = (err: unknown) => /429|insufficient_quota|quota/i.test(err instanceof Error ? err.message : String(err));
  const provider = getImageProvider();
  try {
    await provider.generate({ prompt, outPath, quality: "medium", size: "1536x864" });
    return provider.name === "gemini" ? "gemini" : "openai";
  } catch (err) {
    if (!quota(err)) throw err;
  }
  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new Error("OpenAI sem crédito para as imagens, e não há chave Gemini.");
  }
  try {
    await getImageProvider("gemini").generate({ prompt, outPath, quality: "medium", size: "1536x864" });
    return "gemini";
  } catch (err) {
    if (!quota(err)) throw err;
    throw new Error(
      "Sem crédito de imagem: a conta OpenAI esgotou a quota e o Gemini também. Não gerei o capítulo com um modelo grátis, porque o estilo não sai."
    );
  }
}

function imagePrompt(style: string, bookTitle: string, scene: string, look: string): string {
  return [
    `BOOK: ${bookTitle}. Classic European adventure illustration, ligne claire, clean ink, flat color, 19th century. Not a photo. No letters anywhere, including signs and buildings.`,
    look
      ? `KEEP THIS LOOK in every image of the chapter. It is how the book describes them:\n${look}`
      : "If the same person appears, keep the same face, hair, and clothes.",
    "Draw ONE frozen moment from the scene. Do not invent another person, another place, or an event that is not in that scene.",
    `SCENE:\n${scene}`,
    "Wide 16:9. Faces and feet stay in the middle of the frame. Leave the lower-left corner as floor or street, with no face there.",
    style.slice(0, 2500),
  ].join("\n\n");
}

/** Subtle motion only. A richer prompt made Fal redraw the people. */
function motionPrompt(): string {
  return "Slow cinematic camera move across this illustration. Gentle motion only: cloth, leaves, curtains, hair, and dust in the light. Keep the same drawing, the same faces, and the same clothes. Do not add objects or change the place. No text.";
}

async function narrateChirp(
  text: string,
  voiceId: string,
  speed: number,
  outDir: string,
  channelId: string,
  chapterId: string
): Promise<string> {
  const out = path.join(outDir, "narration.mp3");
  await synthesizeChirpToFile({ text, voiceName: voiceId, speed, outPath: out });
  await recordChirpUsage({
    channelId,
    chapterId,
    characters: chirpBilledCharacters(text),
  }).catch(() => undefined);
  return out;
}

async function narrate(text: string, voiceId: string, language: string, speed: number, outDir: string): Promise<string> {
  const provider = new CartesiaTTSProvider();
  const chunks = splitTextForTts(text, 4500);
  const parts: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const result = await provider.synthesize({
      text: chunks[i],
      voiceId,
      language: language.toLowerCase().startsWith("es") ? "es" : language.toLowerCase().startsWith("en") ? "en" : "pt",
      speed,
      outDir,
      fileBaseName: `part-${String(i + 1).padStart(2, "0")}`,
      measureDuration: false,
    });
    parts.push(result.filePath);
  }
  const out = path.join(outDir, "narration.mp3");
  await concatAudioFiles(parts, out);
  return out;
}

function fitSlots(slots: Array<{ durationSec: number; kind?: string }>, audioSec: number) {
  const stills = slots.filter((slot) => slot.kind !== "ai-clip");
  const clipTotal = slots.reduce((sum, slot) => sum + (slot.kind === "ai-clip" ? slot.durationSec : 0), 0);
  const stillPlanned = stills.reduce((sum, slot) => sum + slot.durationSec, 0) || 1;
  const stillTarget = Math.max(stills.length, audioSec - clipTotal);
  const scale = stillTarget / stillPlanned;
  stills.forEach((slot) => {
    slot.durationSec = Math.max(1, Math.round(slot.durationSec * scale * 10) / 10);
  });
  const drift = audioSec - slots.reduce((sum, slot) => sum + slot.durationSec, 0);
  const lastStill = stills[stills.length - 1];
  if (lastStill) lastStill.durationSec = Math.max(1, Math.round((lastStill.durationSec + drift) * 10) / 10);
}

async function tryFalClip(
  imagePath: string,
  prompt: string,
  durationSec: number,
  outPath: string,
  channelId: string,
  model: string,
  onTick?: (detail: string) => Promise<void>
): Promise<void> {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new Error("Fal não tem chave. A animação não foi substituída por um zoom.");
  const jpg = imagePath.replace(/\.png$/i, ".fal.jpg");
  await runFfmpeg("ffmpeg", [
    "-y",
    "-i",
    imagePath,
    "-vf",
    "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720",
    "-q:v",
    "3",
    jpg,
  ]);
  const imageRef = await persistFile(jpg, channelId, "cover", `motion-${path.basename(jpg)}`, "image/jpeg");
  if (!/^https?:/i.test(imageRef)) throw new Error("A imagem não ficou num endereço que Fal possa abrir.");
  const videoUrl = await falQueue(key, model, imageRef, prompt, onTick);
  const source = outPath + ".src.mp4";
  await download(videoUrl, source);
  const sourceSec = await ffprobeDuration(source).catch(() => durationSec);
  const factor = sourceSec > 0.2 ? durationSec / sourceSec : 1;
  await runFfmpeg("ffmpeg", [
    "-y",
    "-i",
    source,
    "-t",
    durationSec.toFixed(2),
    "-vf",
    `setpts=${factor.toFixed(4)}*PTS,fps=30`,
    "-an",
    "-c:v",
    "libx264",
    "-crf",
    "17",
    "-preset",
    "medium",
    "-pix_fmt",
    "yuv420p",
    outPath,
  ]);
}

async function falQueue(
  key: string,
  model: string,
  imageUrl: string,
  prompt: string,
  onTick?: (detail: string) => Promise<void>
): Promise<string> {
  const headers = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
  const start = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      image_url: imageUrl,
      prompt,
      resolution: "720p",
      aspect_ratio: "16:9",
      enable_prompt_expansion: false,
      acceleration: "regular",
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!start.ok) throw new Error(`Fal ${start.status}: ${(await start.text()).slice(0, 240)}`);
  console.log("[audiobook] Fal aceitou a imagem e o prompt. À espera do vídeo.");
  const queued = (await start.json()) as { status_url?: string; response_url?: string };
  if (!queued.status_url || !queued.response_url) throw new Error("Fal não devolveu a fila.");
  const deadline = Date.now() + 15 * 60 * 1000;
  let state = "na fila";
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 8000));
    let status = "";
    try {
      const statusRes = await fetch(queued.status_url, {
        headers: { Authorization: `Key ${key}` },
        signal: AbortSignal.timeout(25_000),
      });
      const body = (await statusRes.json().catch(() => ({}))) as { status?: string };
      status = body.status || "";
    } catch {
      status = "";
    }
    if (status === "COMPLETED") {
      const done = await fetch(queued.response_url, {
        headers: { Authorization: `Key ${key}` },
        signal: AbortSignal.timeout(60_000),
      });
      if (!done.ok) {
        const detail = (await done.text()).slice(0, 240);
        throw new Error(`Fal resultado ${done.status}: ${detail}`);
      }
      const body = (await done.json()) as { video?: { url?: string } };
      if (!body.video?.url) throw new Error("Fal não devolveu vídeo.");
      console.log("[audiobook] Fal devolveu o vídeo.");
      return body.video.url;
    }
    if (status === "FAILED") throw new Error("Fal falhou o clipe.");
    state = status === "IN_PROGRESS" ? "a gerar" : status === "IN_QUEUE" ? "na fila" : "à espera";
    await onTick?.(`Fal ${state}`).catch(() => undefined);
  }
  throw new Error(`Fal no terminou o clipe (${state}). Não substitui por zoom.`);
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

/** Center-crop to 16:9. gpt-image-1's widest frame is 3:2, so the model is asked to keep the action in the middle. */
async function frameTo16x9(file: string): Promise<void> {
  const tmp = `${file}.16x9.png`;
  await runFfmpeg("ffmpeg", [
    "-y",
    "-i",
    file,
    "-vf",
    "scale=1536:864:force_original_aspect_ratio=increase,crop=1536:864",
    tmp,
  ]);
  fs.renameSync(tmp, file);
}

/** Soft instrumental under the voice. If the library has no track, the narration stays alone. */
async function underVoice(narrationPath: string, outDir: string, channelId: string, chapterId: string): Promise<string> {
  const mixed = path.join(outDir, "with-bed.mp3");
  let musicPath: string | null = null;
  try {
    const bed = await new LibraryMusicProvider().generate({
      channelId,
      videoProjectId: chapterId,
      durationSeconds: await ffprobeDuration(narrationPath),
      style: "epico-suave",
      intensity: "soft",
      instructions: "Instrumental suave, sem voz, por baixo da narração de um audiolivro.",
      outDir,
      fileBaseName: "bed",
    });
    musicPath = bed.filePath;
  } catch (err) {
    console.warn("[audiobook] sem cama musical:", err instanceof Error ? err.message : err);
  }
  await mixNarrationWithBed({
    narrationPath,
    musicPath,
    musicVolume: 0.08,
    ducking: true,
    outputPath: mixed,
  });
  return mixed;
}

async function assemble(
  clips: string[],
  kinds: Array<"ai-clip" | "still-motion">,
  audioPath: string,
  outPath: string
): Promise<void> {
  const durs: number[] = [];
  for (const clip of clips) durs.push(await ffprobeDuration(clip));
  const fade = 1;
  const args = ["-y"];
  clips.forEach((clip) => args.push("-i", clip));
  args.push("-i", audioPath);
  const filters = clips.map(
    (_, i) => `[${i}:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=30,setsar=1,format=yuv420p[v${i}]`
  );
  clips.forEach((_, i) => {
    const duration = durs[i];
    const previousIsClip = i > 0 && kinds[i - 1] === "ai-clip";
    const nextIsClip = i + 1 < kinds.length && kinds[i + 1] === "ai-clip";
    if (kinds[i] === "ai-clip") {
      const head = i > 0 && !previousIsClip ? fade : 0;
      const tail = i + 1 < clips.length && !nextIsClip ? fade : 0;
      const padIn = head > 0 ? `,tpad=start_mode=clone:start_duration=${head.toFixed(2)},fade=t=in:st=0:d=${head.toFixed(2)}:color=black` : "";
      const padOut = tail > 0 ? `,tpad=stop_mode=clone:stop_duration=${tail.toFixed(2)},fade=t=out:st=${(head + duration).toFixed(2)}:d=${tail.toFixed(2)}:color=black` : "";
      filters.push(`[v${i}]trim=0:${duration.toFixed(3)},setpts=PTS-STARTPTS${padIn}${padOut}[seg${i}]`);
      return;
    }
    let keep = duration;
    if (previousIsClip) keep -= fade;
    if (nextIsClip) keep -= fade;
    keep = Math.max(0.4, keep);
    const fadeIn = previousIsClip || i === 0 ? Math.min(fade, keep / 2) : 0;
    const fadeOut = nextIsClip || i === clips.length - 1 ? Math.min(fade, keep / 2) : 0;
    const outAt = Math.max(fadeIn, keep - fadeOut);
    const fadeInFilter = fadeIn > 0 ? `,fade=t=in:st=0:d=${fadeIn.toFixed(2)}:color=black` : "";
    const fadeOutFilter = fadeOut > 0 ? `,fade=t=out:st=${outAt.toFixed(2)}:d=${fadeOut.toFixed(2)}:color=black` : "";
    filters.push(
      `[v${i}]trim=0:${keep.toFixed(3)},setpts=PTS-STARTPTS${fadeInFilter}${fadeOutFilter}[seg${i}]`
    );
  });
  filters.push(`${clips.map((_, i) => `[seg${i}]`).join("")}concat=n=${clips.length}:v=1:a=0,format=yuv420p[v]`);
  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[v]",
    "-map",
    `${clips.length}:a`,
    "-c:v",
    "libx264",
    "-crf",
    "18",
    "-preset",
    "medium",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    outPath
  );
  await runFfmpeg("ffmpeg", args);
}

function coverCopy(chapterLabel: string): { title: string; author: string } {
  const title = chapterLabel.replace(/^capítulo\s+\d+\s*[—:.-]\s*/i, "").trim() || chapterLabel.trim();
  return { title, author: "Júlio Verne" };
}

async function jpegThumb(pngPath: string): Promise<string> {
  const jpg = pngPath.replace(/\.png$/i, ".jpg");
  await runFfmpeg("ffmpeg", ["-y", "-i", pngPath, "-vf", "scale=1280:-2", "-q:v", "5", jpg]);
  return jpg;
}

function youtubeTitle(bookTitle: string, chapterLabel: string, chapterIndex: number): string {
  const hook = chapterLabel.replace(/^capítulo\s+\d+\s*[—:.-]\s*/i, "").trim() || chapterLabel.trim();
  const sequence = `${bookTitle}, capítulo ${chapterIndex} · Júlio Verne`;
  const raw = `${hook} | ${sequence}`;
  if (raw.length <= 100) return raw;
  const withoutAuthor = `${hook} | ${bookTitle}, capítulo ${chapterIndex}`;
  if (withoutAuthor.length <= 100) return withoutAuthor;
  const room = 100 - ` | ${bookTitle}, capítulo ${chapterIndex}`.length;
  const shortHook = room > 8 ? hook.slice(0, room - 1).trimEnd() + "…" : hook.slice(0, 40);
  return `${shortHook} | ${bookTitle}, capítulo ${chapterIndex}`.slice(0, 100);
}

function youtubeDescription(bookTitle: string, chapterLabel: string, nextLabel: string | null): string {
  return [
    `${bookTitle}`,
    chapterLabel,
    "",
    "Júlio Verne em Audiolivro. Narração integral deste capítulo, sem resumo.",
    nextLabel ? `Próximo capítulo: ${nextLabel}.` : "",
    "Inscreva-se para acompanhar a obra.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function uploadPrivate(channelId: string, filePath: string, title: string, description: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const session = await startResumableVideoUpload({
    channelId,
    title,
    description,
    contentType: "video/mp4",
    contentLength: buffer.length,
  });
  const chunk = 8 * 1024 * 1024;
  let start = 0;
  let videoId: string | null = null;
  while (start < buffer.length) {
    const end = Math.min(buffer.length, start + chunk) - 1;
    const result = await putResumableChunk({
      uploadId: session.uploadId,
      channelId,
      start,
      end,
      total: buffer.length,
      body: buffer.subarray(start, end + 1),
    });
    videoId = result.videoId ?? videoId;
    start = result.bytesReceived;
    if (result.done) break;
  }
  if (!videoId) throw new Error("YouTube não devolveu o id do vídeo.");
  return videoId;
}
