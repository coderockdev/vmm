import fs from "fs";
import os from "os";
import path from "path";
import { runFfmpeg, ffprobeBin } from "../../audio/ffmpegUtils";

/** Caption is painted by us so the image model cannot crop letters or mirror a phone UI. */
const MARGIN = 0.12;

const FONT_CANDIDATES = [
  "/System/Library/Fonts/Supplemental/Arial Black.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/Library/Fonts/Arial Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
];

function fontFile(): string {
  for (const candidate of FONT_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("No bold font found to paint the thumbnail caption.");
}

/** Conservative advance so a line is never wider than the safe area. */
function charFactor(ch: string): number {
  if (ch === " ") return 0.34;
  if ("ilI1¡|'.:".includes(ch)) return 0.38;
  if ("MW@¿?ÁÉÍÓÚÜÑÀÈÌÒÙ".includes(ch)) return 0.92;
  return 0.7;
}

function lineWidth(line: string, size: number): number {
  let width = 0;
  for (const ch of line) width += size * charFactor(ch);
  return width;
}

function wrapLines(text: string, maxChars: number): string[] {
  const words = text.split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

/** One line, or a split that lets each line be as large as the channel style. */
function layoutOptions(text: string): string[][] {
  const words = text.split(" ").filter(Boolean);
  const options: string[][] = [[text]];
  if (words.length >= 2) {
    let splitAt = 1;
    let bestGap = Infinity;
    let used = 0;
    for (let i = 1; i < words.length; i++) {
      used += words[i - 1].length + 1;
      const rest = text.length - used;
      const gap = Math.abs(used - rest);
      if (gap < bestGap) {
        bestGap = gap;
        splitAt = i;
      }
    }
    options.push([words.slice(0, splitAt).join(" "), words.slice(splitAt).join(" ")]);
  }
  return options;
}

function fitLines(
  lines: string[],
  maxW: number,
  maxH: number,
  height: number
): { lines: string[]; size: number } {
  const minSize = Math.max(36, Math.round(height * 0.08));
  let size = Math.round(height * 0.22);
  while (size > minSize) {
    const longest = Math.max(...lines.map((line) => lineWidth(line, size)));
    const block = lines.length * size * 1.08;
    if (longest <= maxW && block <= maxH) return { lines, size };
    size -= 2;
  }
  return { lines, size: minSize };
}

function chooseLayout(text: string, maxW: number, maxH: number, height: number): { lines: string[]; size: number } {
  const minSize = Math.max(48, Math.round(height * 0.14));
  let best: { lines: string[]; size: number } | null = null;

  for (const lines of layoutOptions(text)) {
    let size = Math.round(height * 0.38);
    while (size >= minSize) {
      const longest = Math.max(...lines.map((line) => lineWidth(line, size)));
      const block = lines.length * size * 1.05;
      if (longest <= maxW && block <= maxH) {
        if (!best || size > best.size) best = { lines, size };
        break;
      }
      size -= 2;
    }
  }

  if (best) return best;
  return { lines: wrapLines(text, 10), size: minSize };
}

/** Center-crop to 16:9 so YouTube does not shave the caption off a 3:2 frame. */
export async function frameThumbnail16x9(imagePath: string): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vmm-thumb-frame-"));
  try {
    const tmp = path.join(dir, "frame.png");
    await runFfmpeg("ffmpeg", [
      "-y",
      "-i",
      imagePath,
      "-vf",
      "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720",
      tmp,
    ]);
    fs.copyFileSync(tmp, imagePath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Paint thumbnailText in the channel style: very large, lower-left, inside the margin.
 * Last line is yellow; earlier lines are white. Thick black stroke.
 * Overwrites imagePath.
 */
export async function burnThumbnailText(imagePath: string, rawText: string): Promise<void> {
  await frameThumbnail16x9(imagePath);
  const explicit = rawText
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const text = explicit.length > 1 ? explicit.join("\n") : rawText.replace(/\s+/g, " ").trim();
  if (!text) return;

  const probe = await runFfmpeg(ffprobeBin(), [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0:s=x",
    imagePath,
  ]);
  const [wStr, hStr] = probe.stdout.trim().split("x");
  const width = Number(wStr);
  const height = Number(hStr);
  if (!width || !height) throw new Error("Could not read thumbnail size.");

  const marginX = Math.round(width * MARGIN);
  const marginY = Math.round(height * MARGIN);
  // Left column only. The face stays in the right third, uncovered.
  const maxW = Math.round(width * 0.9) - marginX;
  const maxH = Math.round(height * 0.55);
  const { lines, size } =
    explicit.length > 1
      ? fitLines(explicit, maxW, maxH, height)
      : chooseLayout(text, Math.round(width * 0.46) - marginX, Math.round(height * 0.5), height);
  const border = Math.max(8, Math.round(size * 0.1));
  const font = fontFile().replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vmm-thumb-"));
  try {
    const blockH = Math.round(lines.length * size * 1.05);
    const y0 = height - marginY - border - blockH;
    const filters = lines.map((line, i) => {
      const file = path.join(dir, `line-${i}.txt`);
      fs.writeFileSync(file, line, "utf8");
      const y = y0 + Math.round(i * size * 1.05);
      const color = i === lines.length - 1 ? "0xFFE14A" : "white";
      const textFile = file.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
      return `drawtext=fontfile='${font}':textfile='${textFile}':fontsize=${size}:fontcolor=${color}:borderw=${border}:bordercolor=black:x=${marginX + border}:y=${y}`;
    });
    const tmp = path.join(dir, "out.png");
    await runFfmpeg("ffmpeg", ["-y", "-i", imagePath, "-vf", filters.join(","), tmp]);
    fs.copyFileSync(tmp, imagePath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Audiobook cover: chapter title as the hook, author small under it,
 * both in the lower left so the scene stays visible.
 */
export async function burnStoryCover(imagePath: string, title: string, author: string): Promise<void> {
  await frameThumbnail16x9(imagePath);
  const cleanTitle = title.replace(/\s+/g, " ").trim();
  const cleanAuthor = author.replace(/\s+/g, " ").trim();
  if (!cleanTitle) return;

  const probe = await runFfmpeg(ffprobeBin(), [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0:s=x",
    imagePath,
  ]);
  const [wStr, hStr] = probe.stdout.trim().split("x");
  const width = Number(wStr);
  const height = Number(hStr);
  if (!width || !height) throw new Error("Could not read thumbnail size.");

  const marginX = Math.round(width * 0.05);
  const marginY = Math.round(height * 0.05);
  const maxW = Math.round(width * 0.68);
  const maxH = Math.round(height * 0.32);
  const wrapped = layoutOptions(cleanTitle).find((lines) => lines.length > 1) ?? [cleanTitle];
  const { lines, size } = fitLines(wrapped, maxW, maxH, height);
  const border = Math.max(4, Math.round(size * 0.08));
  const authorSize = Math.max(22, Math.round(size * 0.38));
  const authorBorder = Math.max(2, Math.round(authorSize * 0.1));
  const font = fontFile().replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vmm-story-cover-"));
  try {
    const blockH = Math.round(lines.length * size * 1.05);
    const y0 = height - marginY - (cleanAuthor ? authorSize + 10 : 0) - blockH;
    const filters = lines.map((line, i) => {
      const file = path.join(dir, `line-${i}.txt`);
      fs.writeFileSync(file, line, "utf8");
      const y = y0 + Math.round(i * size * 1.05);
      const textFile = file.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
      return `drawtext=fontfile='${font}':textfile='${textFile}':fontsize=${size}:fontcolor=white:borderw=${border}:bordercolor=black:x=${marginX}:y=${y}`;
    });
    if (cleanAuthor) {
      const file = path.join(dir, "author.txt");
      fs.writeFileSync(file, cleanAuthor, "utf8");
      const textFile = file.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
      const y = y0 + blockH + 8;
      filters.push(
        `drawtext=fontfile='${font}':textfile='${textFile}':fontsize=${authorSize}:fontcolor=0xFFE14A:borderw=${authorBorder}:bordercolor=black:x=${marginX}:y=${y}`
      );
    }
    const tmp = path.join(dir, "out.png");
    await runFfmpeg("ffmpeg", ["-y", "-i", imagePath, "-vf", filters.join(","), tmp]);
    fs.copyFileSync(tmp, imagePath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
