import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getChannel } from "../../../../../../core/repo/channels";
import { listBooksForChannel, listChaptersForBook } from "../../../../../../core/repo/books";
import { bookSourceDir } from "../../../../../../core/audiobook/paths";
import { EDGE_AUDIOBOOK_VOICES, synthesizeEdgeMp3 } from "../../../../../../core/audiobook/edgeVoices";
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

  const sourcePath = chapter
    ? path.join(bookSourceDir(book.folder), chapter.sourceFile)
    : "";
  const sampleText =
    chapter && sourcePath && fs.existsSync(sourcePath)
      ? sampleFromChapterText(fs.readFileSync(sourcePath, "utf8"), book.title, chapter.label)
      : `Júlio Verne em audiolivro. ${book.title}. Esta amostra é da voz gratuita. O capítulo completo usa o mesmo narrador.`;

  const samples: Array<{ voiceId: string; label: string; url: string }> = [];
  const errors: string[] = [];

  for (const voice of EDGE_AUDIOBOOK_VOICES) {
    try {
      const buf = await synthesizeEdgeMp3(voice.id, sampleText);
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
    voices: EDGE_AUDIOBOOK_VOICES,
    samples,
    message:
      samples.length > 0
        ? `Teste com ~${sampleText.length} caracteres de ${book.title} — ${chapter.label}.`
        : errors[0] || "Falha ao sintetizar as vozes de teste.",
    errors: errors.length ? errors : undefined,
  });
}
