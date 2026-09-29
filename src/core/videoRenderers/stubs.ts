import { RenderStyledVideoArgs, RenderStyledVideoResult } from "./types";

/** Stub — Whisper-synced highlight scroll (fase 2). */
export async function renderHighlightedScroll(
  _args: RenderStyledVideoArgs
): Promise<RenderStyledVideoResult> {
  throw new Error(
    "Estilo «Texto rolando + destaque» ainda não está disponível (precisa sincronização Whisper)."
  );
}

export async function renderTeleprompter(_args: RenderStyledVideoArgs): Promise<RenderStyledVideoResult> {
  throw new Error("Estilo «Teleprompter» em breve.");
}

export async function renderKaraoke(_args: RenderStyledVideoArgs): Promise<RenderStyledVideoResult> {
  throw new Error("Estilo «Karaokê de frases» em breve.");
}
