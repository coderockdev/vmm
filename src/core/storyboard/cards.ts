import fs from "fs";
import path from "path";
import { runFfmpeg } from "../audio/ffmpegUtils";
import { Channel } from "../types";
import { LocationCardSpec, MapSpec } from "./types";

export interface CardStyle {
  background: string;
  textColor: string;
  reveal: "character" | "instant";
  glow: boolean;
}

export function locationCardStyle(channel: Channel): CardStyle {
  const card = channel.dna.visual.locationCard;
  if (card?.background && card.textColor) {
    return {
      background: card.background,
      textColor: card.textColor,
      reveal: card.reveal === "instant" ? "instant" : "character",
      glow: card.glow !== false,
    };
  }
  return { background: "#071510", textColor: "#3DFF7A", reveal: "character", glow: true };
}

function fontFile(): string | null {
  const candidates = [
    "/System/Library/Fonts/Supplemental/Courier New.ttf",
    "/Library/Fonts/Courier New.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
  ];
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}

function escapeDrawtext(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/%/g, "\\%");
}

async function solidFrame(outPath: string, background: string, filters: string[]): Promise<void> {
  const color = background.replace("#", "0x");
  await runFfmpeg("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=1920x1080:d=1`,
    "-vf",
    filters.join(","),
    "-frames:v",
    "1",
    outPath,
  ]);
}

export async function renderLocationCardPng(args: {
  outPath: string;
  card: LocationCardSpec;
  style: CardStyle;
}): Promise<void> {
  const font = fontFile();
  const lines = args.card.lines.map((line) => line.trim()).filter(Boolean).slice(0, 4);
  if (!font || lines.length === 0) {
    await solidFrame(args.outPath, args.style.background, ["format=yuv420p"]);
    if (!lines.length) throw new Error("Location card has no lines.");
    return;
  }
  const filters = lines.map((line, index) => {
    const y = 380 + index * 90;
    return `drawtext=fontfile='${font}':text='${escapeDrawtext(line)}':fontcolor=${args.style.textColor}:fontsize=54:x=(w-text_w)/2:y=${y}`;
  });
  if (args.card.coordinates) {
    filters.push(
      `drawtext=fontfile='${font}':text='${escapeDrawtext(args.card.coordinates)}':fontcolor=${args.style.textColor}@0.7:fontsize=28:x=(w-text_w)/2:y=860`
    );
  }
  fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
  await solidFrame(args.outPath, args.style.background, filters);
}

export async function renderMapPng(args: { outPath: string; map: MapSpec; style: CardStyle }): Promise<void> {
  const font = fontFile();
  const labels = [args.map.startLabel, ...args.map.stops, args.map.endLabel].map((label) => label.trim()).filter(Boolean);
  if (!font || labels.length === 0) {
    throw new Error("Map shot needs a start, a stop, or an end.");
  }
  const filters = [
    `drawbox=x=940:y=180:w=4:h=${Math.max(80, labels.length * 110)}:color=${args.style.textColor}@0.85:t=fill`,
  ];
  labels.forEach((label, index) => {
    const y = 200 + index * 110;
    filters.push(`drawtext=fontfile='${font}':text='${escapeDrawtext(label)}':fontcolor=${args.style.textColor}:fontsize=42:x=980:y=${y}`);
  });
  fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
  await solidFrame(args.outPath, args.style.background, filters);
}

export async function renderTextCardPng(args: {
  outPath: string;
  text: string;
  style: CardStyle;
  black?: boolean;
}): Promise<void> {
  const font = fontFile();
  const background = args.black ? "#000000" : args.style.background;
  const filters: string[] = [];
  if (font && args.text.trim()) {
    filters.push(
      `drawtext=fontfile='${font}':text='${escapeDrawtext(args.text.trim().slice(0, 80))}':fontcolor=${args.black ? "white" : args.style.textColor}:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2`
    );
  }
  fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
  await solidFrame(args.outPath, background, filters.length ? filters : ["format=yuv420p"]);
}
