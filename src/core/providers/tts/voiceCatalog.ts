import { Language } from "../../types";
import { TTSProviderName } from "./TTSProvider";

/**
 * Curated, named voices — the UI never shows raw provider voice IDs to the
 * user. Add entries here as we validate more voices (via the voice-test
 * endpoint) instead of hardcoding IDs anywhere else in the app.
 */
export interface CatalogVoice {
  id: string; // provider's voice id
  provider: TTSProviderName;
  name: string; // display name
  language: Language;
  gender: "feminine" | "masculine";
  description: string;
  recommendedSpeed: number;
  /** Only true after client sign-off for a channel (e.g. Amor Amor). */
  validatedForChannel?: boolean;
}

export const VOICE_CATALOG: CatalogVoice[] = [
  // --- Cartesia (Sonic) — native pt-BR ---
  {
    id: "c9611be8-aae9-4a93-bb1c-98dd6b7d52a4",
    provider: "cartesia",
    name: "Isabella",
    language: "pt",
    gender: "feminine",
    description: "Rica e expressiva, ótima para narração.",
    recommendedSpeed: 1,
  },
  {
    id: "cb2694c3-715f-4da9-99f3-1c974fff2928",
    provider: "cartesia",
    name: "Eloá",
    language: "pt",
    gender: "feminine",
    description: "Calorosa e articulada, calma.",
    recommendedSpeed: 0.85,
  },
  {
    id: "8c44acc3-f107-460b-8958-a57ec638eaf5",
    provider: "cartesia",
    name: "Lívia",
    language: "pt",
    gender: "feminine",
    description: "Composta e compreensiva.",
    recommendedSpeed: 0.9,
  },
  {
    id: "b0f46533-d4bb-493f-a26f-a99e1f2e86e3",
    provider: "cartesia",
    name: "Heitor",
    language: "pt",
    gender: "masculine",
    description: "Caloroso, charme simples do interior — ótimo para histórias.",
    recommendedSpeed: 1,
  },
  {
    id: "07b6f895-78b9-4921-8e10-8a21c99c2e8a",
    provider: "cartesia",
    name: "Rafael",
    language: "pt",
    gender: "masculine",
    description: "Envolvente e carismático.",
    recommendedSpeed: 1.05,
  },

  // --- Cartesia (Sonic) — native es ---
  {
    id: "ae823354-f9be-4aef-8543-f569644136b4",
    provider: "cartesia",
    name: "Mariana",
    language: "es",
    gender: "feminine",
    description: "Maternal, tom calmo e acolhedor.",
    recommendedSpeed: 0.9,
  },
  {
    id: "1cc00672-e9d4-455e-b3fb-31dfb7aad231",
    provider: "cartesia",
    name: "Laura",
    language: "es",
    gender: "feminine",
    description: "Presença estável e confiável, calorosa.",
    recommendedSpeed: 0.9,
  },
  {
    id: "de38f545-c574-44e8-9b54-a7d6fec1c6b1",
    provider: "cartesia",
    name: "Marta",
    language: "es",
    gender: "feminine",
    description: "Acolhedora, espanhol de Espanha.",
    recommendedSpeed: 0.9,
  },

  // --- Local fallback (macOS say) — always available, zero cost ---
  { id: "Luciana", provider: "local", name: "Luciana (local)", language: "pt", gender: "feminine", description: "Voz local macOS, grátis.", recommendedSpeed: 0.95 },
  { id: "Monica", provider: "local", name: "Monica (local)", language: "es", gender: "feminine", description: "Voz local macOS, grátis.", recommendedSpeed: 1 },
];

export function getVoicesForLanguage(language: Language): CatalogVoice[] {
  return VOICE_CATALOG.filter((v) => v.language === language);
}

export function findVoice(provider: TTSProviderName, id: string): CatalogVoice | undefined {
  return VOICE_CATALOG.find((v) => v.provider === provider && v.id === id);
}
