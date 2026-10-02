import type { AuditionVoice } from "./auditionVoices";

/** Chirp 3 HD names on Cloud Text-to-Speech. Same set for pt-BR and es-US. */
const CHIRP_NAMES: Array<[string, "M" | "F"]> = [
  ["Achernar", "F"],
  ["Achird", "M"],
  ["Algenib", "M"],
  ["Algieba", "M"],
  ["Alnilam", "M"],
  ["Aoede", "F"],
  ["Autonoe", "F"],
  ["Callirrhoe", "F"],
  ["Charon", "M"],
  ["Despina", "F"],
  ["Enceladus", "M"],
  ["Erinome", "F"],
  ["Fenrir", "M"],
  ["Gacrux", "F"],
  ["Iapetus", "M"],
  ["Kore", "F"],
  ["Laomedeia", "F"],
  ["Leda", "F"],
  ["Orus", "M"],
  ["Puck", "M"],
  ["Pulcherrima", "F"],
  ["Rasalgethi", "M"],
  ["Sadachbia", "M"],
  ["Sadaltager", "M"],
  ["Schedar", "M"],
  ["Sulafat", "F"],
  ["Umbriel", "M"],
  ["Vindemiatrix", "F"],
  ["Zephyr", "F"],
  ["Zubenelgenubi", "M"],
];

const CHIRP_ID = /^(pt-BR|es-US)-Chirp3-HD-[A-Za-z]+$/;
const COST = "1 milhão de caracteres/mês grátis, depois US$ 30 / milhão";

type CacheEntry = { at: number; voices: AuditionVoice[] };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 10 * 60 * 1000;

export function isChirpConfigured(): boolean {
  return Boolean(process.env.GOOGLE_TTS_API_KEY?.trim());
}

export function isChirpVoiceId(id: string): boolean {
  return CHIRP_ID.test(id.trim());
}

export function chirpLocale(language: string): "pt-BR" | "es-US" {
  return language === "es" ? "es-US" : "pt-BR";
}

function toVoice(locale: "pt-BR" | "es-US", name: string, gender: "M" | "F"): AuditionVoice {
  const tongue = locale === "pt-BR" ? "português do Brasil" : "espanhol latino";
  return {
    provider: "google",
    id: `${locale}-Chirp3-HD-${name}`,
    name,
    note: `${gender === "M" ? "masculina" : "feminina"} · ${tongue}`,
    cost: COST,
    canSample: true,
  };
}

/** Static catalog for the DNA editor. The live Google list is used on the server. */
export function chirpCatalogVoices(language: string): AuditionVoice[] {
  return fallback(chirpLocale(language));
}

function fallback(locale: "pt-BR" | "es-US"): AuditionVoice[] {
  return CHIRP_NAMES.map(([name, gender]) => toVoice(locale, name, gender)).sort(byNarration);
}

function byNarration(a: AuditionVoice, b: AuditionVoice): number {
  const maleA = a.note.startsWith("masculina") ? 0 : 1;
  const maleB = b.note.startsWith("masculina") ? 0 : 1;
  return maleA - maleB || a.name.localeCompare(b.name);
}

/** Voices enabled on this Google Cloud project, in the channel language. */
export async function listChirpVoices(language: string): Promise<AuditionVoice[]> {
  const locale = chirpLocale(language);
  const hit = cache.get(locale);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.voices;
  const live = await fetchChirp(locale).catch(() => null);
  const voices = live && live.length > 0 ? live : fallback(locale);
  if (live && live.length > 0) cache.set(locale, { at: Date.now(), voices });
  return voices;
}

async function fetchChirp(locale: "pt-BR" | "es-US"): Promise<AuditionVoice[] | null> {
  const key = process.env.GOOGLE_TTS_API_KEY?.trim();
  if (!key) return null;
  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/voices?languageCode=${locale}`,
    { headers: { "X-Goog-Api-Key": key }, signal: AbortSignal.timeout(8000) }
  );
  if (!response.ok) return null;
  const json = (await response.json()) as {
    voices?: Array<{ name?: string; ssmlGender?: string }>;
  };
  const voices = (json.voices ?? [])
    .filter((voice) => typeof voice.name === "string" && voice.name.includes("-Chirp3-HD-"))
    .map((voice) => {
      const name = voice.name!.split("-Chirp3-HD-")[1] || voice.name!;
      const gender = voice.ssmlGender === "FEMALE" ? "F" : "M";
      return toVoice(locale, name, gender);
    })
    .sort(byNarration);
  return voices;
}
