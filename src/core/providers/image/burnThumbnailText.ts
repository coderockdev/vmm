import fs from "fs";
import os from "os";
import path from "path";
import { runFfmpeg, ffprobeBin } from "../../audio/ffmpegUtils";

/** Caption is painted by us so the image model cannot crop letters or mirror a phone UI. */
const MARGIN = 0.06;

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

/**
 * Paint thumbnailText in the channel style: very large, top-left, inside the margin.
 * Last line is yellow; earlier lines are white. Thick black stroke.
 * Overwrites imagePath.
 */
export async function burnThumbnailText(imagePath: string, rawText: string): Promise<void> {
  const text = rawText.replace(/\s+/g, " ").trim();
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
  const { lines, size } = chooseLayout(
    text,
    Math.round(width * 0.62) - marginX,
    Math.round(height * 0.55),
    height
  );
  const border = Math.max(8, Math.round(size * 0.1));
  const font = fontFile().replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vmm-thumb-"));
  try {
    const filters = lines.map((line, i) => {
      const file = path.join(dir, `line-${i}.txt`);
      fs.writeFileSync(file, line, "utf8");
      const y = marginY + border + Math.round(i * size * 1.05);
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
