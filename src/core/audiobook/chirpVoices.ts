/** Chirp 3 HD voices for Portuguese audiobook narration (test + production). */
export const CHIRP_TEST_VOICES = [
  { id: "pt-BR-Chirp3-HD-Charon", label: "Charon" },
  { id: "pt-BR-Chirp3-HD-Orus", label: "Orus" },
  { id: "pt-BR-Chirp3-HD-Fenrir", label: "Fenrir" },
] as const;

export type ChirpVoiceId = (typeof CHIRP_TEST_VOICES)[number]["id"];

export function isChirpConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT
  );
}
