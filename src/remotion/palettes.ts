import { PaletteId } from "../core/types";

export interface Palette {
  background: string;
  primary: string;
  secondary: string;
  accent: string;
  textColor: string;
  glow: string;
}

export const PALETTES: Record<PaletteId, Palette> = {
  cosmic: {
    background: "#120321",
    primary: "#ff2ea6",
    secondary: "#7b2ff7",
    accent: "#f7d046",
    textColor: "#ffffff",
    glow: "#ff6ec7",
  },
  "night-sky": {
    background: "#050818",
    primary: "#4a6fe0",
    secondary: "#1c2b5e",
    accent: "#e8d98f",
    textColor: "#f2f4ff",
    glow: "#7fa0ff",
  },
  "warm-story": {
    background: "#1c0f08",
    primary: "#e0a35a",
    secondary: "#c9642f",
    accent: "#ffe1a8",
    textColor: "#fff6ea",
    glow: "#ffb35a",
  },
  "rain-blue": {
    background: "#03121a",
    primary: "#4a8fa0",
    secondary: "#1c4550",
    accent: "#bfe8f0",
    textColor: "#eafcff",
    glow: "#6fd6e8",
  },
};

export function getPalette(id: PaletteId): Palette {
  return PALETTES[id] ?? PALETTES.cosmic;
}
