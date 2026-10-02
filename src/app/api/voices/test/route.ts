import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { getTTSProvider, TTSProviderName } from "../../../../core/providers/tts";
import { compileForVoice, VoiceCompileError } from "../../../../core/providers/tts/compileForVoice";
import { VoiceProfile, profileFromLegacyVoice } from "../../../../core/providers/tts/voiceCapabilities";
import { synthesizeChirpMp3 } from "../../../../core/providers/tts/chirpSpeech";
import { isChirpVoiceId } from "../../../../core/audiobook/chirpVoices";

/**
 * Synthesizes a short sample with any provider/voice, for the voice-testing
 * UI. Nothing here is persisted — scratch file streamed back and discarded.
 * Optional `confirmPaid: true` required when body.paidSample is set (credit use).
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const provider = String(body.provider ?? "cartesia");
  const voiceId: string | null = body.voiceId ?? null;
  let text: string = body.text;
  const speed: number = body.speed ?? 1;
  const language: "es" | "pt" | "en" = body.language ?? "pt";
  const profile = body.profile as VoiceProfile | undefined;
  const paidSample = Boolean(body.paidSample);
  const confirmPaid = Boolean(body.confirmPaid);

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  if (provider === "google" || isChirpVoiceId(voiceId ?? "")) {
    const plain = String(text)
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220);
    if (!voiceId || !isChirpVoiceId(voiceId)) {
      return NextResponse.json({ error: "Essa voz do Google não é Chirp." }, { status: 400 });
    }
    try {
      const audio = await synthesizeChirpMp3({ text: plain, voiceName: voiceId, speed });
      return new NextResponse(new Uint8Array(audio), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg", "Content-Length": String(audio.length) },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  if (provider === "heygen") {
    return NextResponse.json(
      {
        error:
          "HeyGen: use a prévia gratuita do card (preview_audio). Não geramos vídeo para testar voz.",
      },
      { status: 400 }
    );
  }

  if (paidSample && !confirmPaid) {
    return NextResponse.json(
      {
        error: `Isto usa ~${Math.min(text.length, 150)} caracteres de crédito do provider ${provider}. Confirme com confirmPaid: true.`,
        requiresConfirm: true,
      },
      { status: 402 }
    );
  }

  if (paidSample) {
    text = text.slice(0, 150);
  }

  const effectiveProfile =
    profile ??
    profileFromLegacyVoice({
      provider: provider as VoiceProfile["provider"],
      voiceId,
      speed,
      language,
    });

  try {
    text = compileForVoice(text, effectiveProfile);
  } catch (err) {
    if (err instanceof VoiceCompileError) {
      return NextResponse.json({ error: err.message, badTags: err.badTags }, { status: 400 });
    }
    throw err;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vmm-voice-test-"));
  try {
    const ttsProvider = getTTSProvider(provider as TTSProviderName);
    const result = await ttsProvider.synthesize({
      text,
      language,
      voiceId,
      speed,
      outDir: tmpDir,
      fileBaseName: "sample",
      measureDuration: false,
    });

    const audioBuffer = fs.readFileSync(result.filePath);
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
