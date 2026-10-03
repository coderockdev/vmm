/**
 * Chapter stills. Landscape 1536×1024, OpenAI list prices (Oct 2026).
 * The DNA stores the id. Missing id means the full model at medium.
 */

export type StillImageChoiceId =
  | "gpt-image-1-high"
  | "gpt-image-1-medium"
  | "gpt-image-1-low"
  | "gpt-image-1-mini-high"
  | "gpt-image-1-mini-medium"
  | "gpt-image-1-mini-low";

export interface StillImageChoice {
  id: StillImageChoiceId;
  model: "gpt-image-1" | "gpt-image-1-mini";
  quality: "low" | "medium" | "high";
  usd: number;
  label: string;
  offer: string;
}

export const DEFAULT_STILL_IMAGE_CHOICE: StillImageChoiceId = "gpt-image-1-medium";

/** About how many stills a 10-minute chapter asks for. */
export const STILLS_PER_TEN_MINUTES = 60;

export const STILL_IMAGE_CHOICES: StillImageChoice[] = [
  {
    id: "gpt-image-1-high",
    model: "gpt-image-1",
    quality: "high",
    usd: 0.25,
    label: "ChatGPT completo · alta",
    offer: "Máximo detalhe em caras, roupa e fundo.",
  },
  {
    id: "gpt-image-1-medium",
    model: "gpt-image-1",
    quality: "medium",
    usd: 0.063,
    label: "ChatGPT completo · média",
    offer: "O desenho que o canal está a avaliar. Caras, roupa e o traço do livro saem inteiros.",
  },
  {
    id: "gpt-image-1-low",
    model: "gpt-image-1",
    quality: "low",
    usd: 0.016,
    label: "ChatGPT completo · baixa",
    offer: "O mesmo modelo, com menos detalhe. Caras e texturas ficam mais simples.",
  },
  {
    id: "gpt-image-1-mini-high",
    model: "gpt-image-1-mini",
    quality: "high",
    usd: 0.052,
    label: "ChatGPT mini · alta",
    offer: "O melhor nível do mini. Caras e roupa saem mais simples que no modelo completo.",
  },
  {
    id: "gpt-image-1-mini-medium",
    model: "gpt-image-1-mini",
    quality: "medium",
    usd: 0.015,
    label: "ChatGPT mini · média",
    offer: "Segue a cena. O traço, as caras e a roupa saem mais simples.",
  },
  {
    id: "gpt-image-1-mini-low",
    model: "gpt-image-1-mini",
    quality: "low",
    usd: 0.006,
    label: "ChatGPT mini · baixa",
    offer: "O mais barato, para volume. O desenho fica plano.",
  },
];

export function stillImageChoice(id: string | null | undefined): StillImageChoice {
  return STILL_IMAGE_CHOICES.find((choice) => choice.id === id) ?? STILL_IMAGE_CHOICES[1];
}

/** What a video cover asks OpenAI for. The DNA card is the source. */
export function stillImageRequest(id: string | null | undefined): {
  model: StillImageChoice["model"];
  quality: StillImageChoice["quality"];
} {
  const choice = stillImageChoice(id);
  return { model: choice.model, quality: choice.quality };
}

/** Usage-event label. openaiImageUsd reads the model and the quality from this string. */
export function stillImageUsageLabel(choice: StillImageChoice): string {
  return `${choice.model} ${choice.quality} 1536x1024`;
}

export function formatStillUsd(value: number): string {
  const digits = value < 0.1 ? 3 : 2;
  return `US$${value.toFixed(digits)}`;
}
