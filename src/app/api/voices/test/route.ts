import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { getTTSProvider, TTSProviderName } from "../../../../core/providers/tts";

/**
 * Synthesizes a short sample with any provider/voice, for the voice-testing
 * UI. Nothing here is persisted to the project's data dir — it's a scratch
 * file streamed back and discarded, unlike the real narration pipeline.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const provider: TTSProviderName = body.provider ?? "cartesia";
  const voiceId: string | null = body.voiceId ?? null;
  const text: string = body.text;
  const speed: number = body.speed ?? 1;
  const language: "es" | "pt" | "en" = body.language ?? "pt";

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vmm-voice-test-"));
  try {
    const ttsProvider = getTTSProvider(provider);
    const result = await ttsProvider.synthesize({
      text,
      language,
      voiceId,
      speed,
      outDir: tmpDir,
      fileBaseName: "sample",
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
