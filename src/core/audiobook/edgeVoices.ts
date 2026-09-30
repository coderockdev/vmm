import { Readable } from "stream";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

/** Free pt-BR neural voices (Microsoft Edge). No API key and no per-character charge. */
export const EDGE_AUDIOBOOK_VOICES = [
  { id: "pt-BR-AntonioNeural", label: "Antônio", note: "masculina, narração" },
  { id: "pt-BR-DonatoNeural", label: "Donato", note: "masculina, mais grave" },
  { id: "pt-BR-FranciscaNeural", label: "Francisca", note: "feminina" },
] as const;

export type EdgeVoiceId = (typeof EDGE_AUDIOBOOK_VOICES)[number]["id"];

export async function synthesizeEdgeMp3(voiceId: string, text: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text, { rate: "-8%" });
  const chunks: Buffer[] = [];
  for await (const chunk of audioStream as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  tts.close();
  const buf = Buffer.concat(chunks);
  if (buf.length < 800) throw new Error(`Voz ${voiceId} devolveu áudio vazio`);
  return buf;
}
