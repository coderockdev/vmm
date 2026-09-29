import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getChannel } from "../../../../../../core/repo/channels";
import { listBooksForChannel, listChaptersForBook } from "../../../../../../core/repo/books";
import { bookSourceDir } from "../../../../../../core/audiobook/paths";
import { CHIRP_TEST_VOICES, isChirpConfigured } from "../../../../../../core/audiobook/chirpVoices";
import { workingFilePath, persistFileWithLocalFallback } from "../../../../../../core/storage";
import { mediaUrl } from "../../../../../../core/media";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SAMPLE_CHARS = 800;

function sampleFromChapterText(raw: string, bookTitle: string, chapterLabel: string): string {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  // Drop header line (obra — capítulo).
  const body = lines.slice(1).join("\n").trim();
  const opening = `Júlio Verne em Audiolivro. ${bookTitle}. ${chapterLabel}.`;
  const combined = `${opening}\n\n${body}`;
  if (combined.length <= SAMPLE_CHARS) return combined;
  const cut = combined.slice(0, SAMPLE_CHARS);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (lastStop > 200 ? cut.slice(0, lastStop + 1) : cut).trim();
}

export async function POST(
  _req: Request,
  { params }: { params: { channelId: string } }
) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  if (channel.dna.mode !== "audiobook") {
    return NextResponse.json({ error: "Canal não é audiolivro" }, { status: 400 });
  }

  const books = await listBooksForChannel(channel.id);
  const book = books[0];
  if (!book) {
    return NextResponse.json(
      { error: "Carrega o catálogo de livros primeiro (aba Livros)." },
      { status: 400 }
    );
  }

  const chapters = await listChaptersForBook(book.id);
  const chapter = chapters.find((c) => c.index === 1) ?? chapters[0];
  if (!chapter) {
    return NextResponse.json({ error: "Obra sem capítulos." }, { status: 400 });
  }

  const sourcePath = path.join(bookSourceDir(book.folder), chapter.sourceFile);
  if (!fs.existsSync(sourcePath)) {
    return NextResponse.json(
      { error: `Texto não encontrado: ${book.folder}/${chapter.sourceFile}` },
      { status: 404 }
    );
  }

  const raw = fs.readFileSync(sourcePath, "utf8");
  const sampleText = sampleFromChapterText(raw, book.title, chapter.label);

  if (!isChirpConfigured()) {
    return NextResponse.json({
      ready: false,
      sampleText,
      bookTitle: book.title,
      chapterLabel: chapter.label,
      voices: CHIRP_TEST_VOICES,
      message:
        "Vozes Chirp ainda sem credenciais Google Cloud. Escolhe e guarda a voz na UI; " +
        "para ouvir o teste, configura GOOGLE_APPLICATION_CREDENTIALS (Text-to-Speech API).",
      samples: [],
    });
  }

  // Lazy require — package is optional until TTS stage is fully wired.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let TextToSpeechClient: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@google-cloud/text-to-speech") as {
      TextToSpeechClient: new () => {
        synthesizeSpeech: (req: unknown) => Promise<[ { audioContent?: Uint8Array | string | null } ]>;
      };
    };
    TextToSpeechClient = mod.TextToSpeechClient;
  } catch {
    return NextResponse.json({
      ready: false,
      sampleText,
      bookTitle: book.title,
      chapterLabel: chapter.label,
      voices: CHIRP_TEST_VOICES,
      message:
        "Pacote @google-cloud/text-to-speech não instalado. Guarda a voz preferida; o TTS completo vem na próxima etapa.",
      samples: [],
    });
  }

  const client = new TextToSpeechClient();
  const samples: Array<{ voiceId: string; label: string; url: string }> = [];
  const errors: string[] = [];

  for (const voice of CHIRP_TEST_VOICES) {
    try {
      const [response] = await client.synthesizeSpeech({
        input: { text: sampleText },
        voice: { languageCode: "pt-BR", name: voice.id },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: 0.95,
        },
      });
      if (!response.audioContent) throw new Error("Resposta sem áudio");
      const buf = Buffer.from(response.audioContent as Uint8Array);
      const fileName = `voice-test-${voice.label.toLowerCase()}.mp3`;
      const outPath = workingFilePath(channel.id, "audio", fileName);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, buf);
      const persisted = await persistFileWithLocalFallback(
        outPath,
        channel.id,
        "audio",
        fileName,
        "audio/mpeg"
      );
      const url = mediaUrl(channel.id, persisted.ref);
      if (url) samples.push({ voiceId: voice.id, label: voice.label, url });
    } catch (err) {
      errors.push(`${voice.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    ready: samples.length > 0,
    sampleText,
    bookTitle: book.title,
    chapterLabel: chapter.label,
    voices: CHIRP_TEST_VOICES,
    samples,
    message:
      samples.length > 0
        ? `Teste com ~${sampleText.length} caracteres de ${book.title} — ${chapter.label}.`
        : errors[0] || "Falha ao sintetizar as vozes de teste.",
    errors: errors.length ? errors : undefined,
  });
}
