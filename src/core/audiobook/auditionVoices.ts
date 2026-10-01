export type AuditionProvider =
  | "edge"
  | "cartesia"
  | "elevenlabs"
  | "openai"
  | "gemini"
  | "google";

export type AuditionVoice = {
  provider: AuditionProvider;
  id: string;
  name: string;
  note: string;
  cost: string;
  /** Google Cloud Chirp is listed so it can be chosen later. Sampling it from here timed out (504). */
  canSample: boolean;
};

export const AUDITION_PROVIDERS: { id: AuditionProvider; label: string }[] = [
  { id: "edge", label: "Microsoft · grátis" },
  { id: "cartesia", label: "Cartesia · concorrente da ElevenLabs" },
  { id: "elevenlabs", label: "ElevenLabs" },
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Gemini · Google" },
  { id: "google", label: "Google Cloud Chirp" },
];

/** Masculine Portuguese (or multilingual that speaks Portuguese) voices to compare. */
export const AUDITION_VOICES: AuditionVoice[] = [
  {
    provider: "edge",
    id: "pt-BR-AntonioNeural",
    name: "Antônio",
    note: "brasileiro, narração",
    cost: "Grátis",
    canSample: true,
  },
  {
    provider: "cartesia",
    id: "b0f46533-d4bb-493f-a26f-a99e1f2e86e3",
    name: "Heitor",
    note: "brasileiro, caloroso",
    cost: "Barata",
    canSample: true,
  },
  {
    provider: "cartesia",
    id: "07b6f895-78b9-4921-8e10-8a21c99c2e8a",
    name: "Rafael",
    note: "brasileiro, carismático",
    cost: "Barata",
    canSample: true,
  },
  {
    provider: "elevenlabs",
    id: "2CECaLAGTS5NRGxgbcxr",
    name: "Davi Andrei",
    note: "brasileiro",
    cost: "A mais cara",
    canSample: true,
  },
  {
    provider: "openai",
    id: "onyx",
    name: "Onyx",
    note: "grave, fala português",
    cost: "Baixa",
    canSample: true,
  },
  {
    provider: "openai",
    id: "ash",
    name: "Ash",
    note: "fala português",
    cost: "Baixa",
    canSample: true,
  },
  {
    provider: "gemini",
    id: "Charon",
    name: "Charon",
    note: "grave",
    cost: "Cupo do Gemini",
    canSample: true,
  },
  {
    provider: "gemini",
    id: "Orus",
    name: "Orus",
    note: "firme",
    cost: "Cupo do Gemini",
    canSample: true,
  },
  {
    provider: "gemini",
    id: "Fenrir",
    name: "Fenrir",
    note: "encorpada",
    cost: "Cupo do Gemini",
    canSample: true,
  },
  {
    provider: "gemini",
    id: "Puck",
    name: "Puck",
    note: "mais jovem",
    cost: "Cupo do Gemini",
    canSample: true,
  },
  {
    provider: "google",
    id: "pt-BR-Chirp3-HD-Charon",
    name: "Charon",
    note: "conta Cloud não ligada — esta era o erro 504",
    cost: "~2 livros/mês grátis, depois US$ 30 / milhão",
    canSample: false,
  },
  {
    provider: "google",
    id: "pt-BR-Chirp3-HD-Orus",
    name: "Orus",
    note: "conta Cloud não ligada",
    cost: "~2 livros/mês grátis, depois US$ 30 / milhão",
    canSample: false,
  },
  {
    provider: "google",
    id: "pt-BR-Chirp3-HD-Fenrir",
    name: "Fenrir",
    note: "conta Cloud não ligada",
    cost: "~2 livros/mês grátis, depois US$ 30 / milhão",
    canSample: false,
  },
];

export function findAuditionVoice(provider: string, id: string): AuditionVoice | undefined {
  return AUDITION_VOICES.find((v) => v.provider === provider && v.id === id);
}

const CARTESIA_VOICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCartesiaVoiceId(id: string): boolean {
  return CARTESIA_VOICE_ID.test(id.trim());
}

export const AUDITION_SAMPLE_TEXT =
  "Júlio Verne em audiolivro. Viagem ao Centro da Terra. Capítulo um. No domingo, vinte e quatro de maio de mil oitocentos e sessenta e três, meu tio, o professor Lidenbrock, voltou apressado à sua casinha.";
