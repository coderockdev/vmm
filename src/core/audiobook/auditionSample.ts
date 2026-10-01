import { synthesizeEdgeMp3 } from "./edgeVoices";
import { findAuditionVoice, isCartesiaVoiceId, type AuditionProvider } from "./auditionVoices";

const SAMPLE_PT =
  "Júlio Verne em audiolivro. Capítulo um. O professor Lidenbrock voltou apressado para casa.";
const SAMPLE_ES =
  "Julio Verne en audiolibro. Capítulo uno. El profesor Lidenbrock volvió apurado a casa.";
const SAMPLE_EN = "Jules Verne, audiobook. Chapter one. Professor Lidenbrock hurried back home.";

function sampleFor(language: string): { text: string; cartesia: "pt" | "es" | "en" } {
  if (language === "es") return { text: SAMPLE_ES, cartesia: "es" };
  if (language === "en") return { text: SAMPLE_EN, cartesia: "en" };
  return { text: SAMPLE_PT, cartesia: "pt" };
}

export async function synthesizeAudition(
  provider: AuditionProvider,
  voiceId: string,
  language = "pt"
): Promise<Buffer> {
  const sample = sampleFor(language);
  const known = findAuditionVoice(provider, voiceId);
  const dynamicCartesia = provider === "cartesia" && isCartesiaVoiceId(voiceId);
  if (!known && !dynamicCartesia) throw new Error("Voz desconhecida.");
  if (known && !known.canSample) {
    throw new Error(
      "Google Cloud não está ligado nesta conta. Charon por esse caminho estourava em 504. Ouve o Charon do Gemini, que responde."
    );
  }
  if (provider === "edge") return synthesizeEdgeMp3(voiceId, sample.text);
  if (provider === "cartesia") return cartesia(voiceId, sample.text, sample.cartesia);
  if (provider === "elevenlabs") return eleven(voiceId);
  if (provider === "openai") return openai(voiceId);
  if (provider === "gemini") return gemini(voiceId);
  throw new Error("Provedor sem amostra.");
}

async function cartesia(voiceId: string, transcript: string, language: "pt" | "es" | "en"): Promise<Buffer> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) throw new Error("Falta CARTESIA_API_KEY.");
  const response = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "Cartesia-Version": "2026-08-14",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: "sonic-3.6",
      transcript,
      voice: { id: voiceId },
      language,
      output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Cartesia ${response.status}: ${body.slice(0, 180)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function eleven(voiceId: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("Falta ELEVENLABS_API_KEY.");
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: SAMPLE_PT,
      model_id: "eleven_multilingual_v2",
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ElevenLabs ${response.status}: ${body.slice(0, 180)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function openai(voiceId: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Falta OPENAI_API_KEY.");
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: voiceId,
      input: SAMPLE_PT,
      response_format: "mp3",
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI ${response.status}: ${body.slice(0, 180)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function gemini(voiceName: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY.");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Fale em português do Brasil, tom de narrador: ${SAMPLE_PT}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
      }),
    }
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini ${response.status}: ${body.slice(0, 180)}`);
  }
  const json = await response.json();
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const inline = parts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data)?.inlineData;
  if (!inline?.data) throw new Error("Gemini não devolveu áudio.");
  const pcm = Buffer.from(inline.data, "base64");
  return pcmToWav(pcm, 24000);
}

function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
