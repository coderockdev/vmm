import os from "os";
import path from "path";
import { mkdtemp, rm, stat } from "fs/promises";
import { runFfmpeg } from "../../audio/ffmpegUtils";
import { persistFile } from "../../storage";

/** Hard ceiling. The grid thumb is only there to recognize the cover. */
const MAX_BYTES = 30 * 1024 - 1;

export function identificationFileName(fileName: string): string {
  return fileName.replace(/\.png$/i, "-id.jpg");
}

/** Tiny JPEG next to the full PNG. The PNG stays for YouTube. */
export async function persistIdentificationThumb(
  sourcePath: string,
  channelId: string,
  pngFileName: string
): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "vmm-id-thumb-"));
  const output = path.join(dir, "id.jpg");
  try {
    let width = 240;
    let quality = 16;
    for (let attempt = 0; attempt < 8; attempt++) {
      await runFfmpeg("ffmpeg", [
        "-y",
        "-i",
        sourcePath,
        "-vf",
        `scale=${width}:-2`,
        "-q:v",
        String(quality),
        output,
      ]);
      const size = (await stat(output)).size;
      if (size <= MAX_BYTES) break;
      quality = Math.min(31, quality + 4);
      if (quality >= 31) width = Math.max(120, width - 40);
    }
    await persistFile(
      output,
      channelId,
      "thumbnails",
      identificationFileName(pngFileName),
      "image/jpeg"
    );
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function fileNameFromThumbRef(ref: string): string | null {
  const clean = ref.split("?")[0];
  const name = clean.split("/").pop() || "";
  if (!/\.png$/i.test(name)) return null;
  return name;
}
