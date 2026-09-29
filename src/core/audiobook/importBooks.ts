import fs from "fs";
import path from "path";
import {
  bulkUpsertBooksAndChapters,
  getAudiobookSettings,
  listBooksForChannel,
  saveAudiobookSettings,
  stableBookId,
} from "../repo/books";
import { DEFAULT_AUDIOBOOK_SETTINGS } from "../types";
import { assignProductionOrder } from "./productionOrder";
import { JULIO_VERNE_PACKAGE, julioVernePackageDir } from "./paths";

export type IndiceChapter = {
  arquivo: string;
  titulo: string;
  palavras: number;
  min: number;
};

export type IndiceBook = {
  n: number;
  obra: string;
  pasta: string;
  capitulos: IndiceChapter[];
};

export type ImportBooksResult = {
  packageRoot: string;
  packageName: string;
  booksUpserted: number;
  chaptersUpserted: number;
  totalBooks: number;
  totalChapters: number;
};

function readIndice(packageRoot: string): IndiceBook[] {
  const indicePath = path.join(packageRoot, "indice.json");
  if (!fs.existsSync(indicePath)) {
    throw new Error(`indice.json não encontrado em ${packageRoot}`);
  }
  const raw = fs.readFileSync(indicePath, "utf8");
  const data = JSON.parse(raw) as IndiceBook[];
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("indice.json vazio ou inválido");
  }
  return data;
}

/**
 * Idempotent import of the Julio Verne chapter package into books/chapters.
 * One bulk write (few Supabase round-trips) — safe to click twice.
 */
export async function importJulioVerneBooks(
  channelId: string,
  options: { packageRoot?: string } = {}
): Promise<ImportBooksResult> {
  const packageRoot = options.packageRoot ?? julioVernePackageDir();
  if (!fs.existsSync(packageRoot)) {
    throw new Error(
      `Pacote não encontrado: ${packageRoot}. Copie julio_verne_capitulos para data/books/.`
    );
  }

  const indice = readIndice(packageRoot);
  const orderMap = assignProductionOrder(
    indice.map((b) => ({ title: b.obra, number: b.n }))
  );

  const books = [];
  const chapters = [];
  let totalChapters = 0;

  for (const entry of indice) {
    const folderPath = path.join(packageRoot, entry.pasta);
    if (!fs.existsSync(folderPath)) {
      throw new Error(`Pasta da obra ausente: ${entry.pasta}`);
    }

    const totalWords = entry.capitulos.reduce((s, c) => s + (c.palavras || 0), 0);
    const orderIndex = orderMap.get(entry.obra) ?? entry.n;
    const bookId = stableBookId(channelId, entry.pasta);

    books.push({
      channelId,
      orderIndex,
      number: entry.n,
      title: entry.obra,
      folder: entry.pasta,
      totalChapters: entry.capitulos.length,
      totalChars: 0,
      totalWords,
      playlistTitle: `${entry.obra} — Audiolivro Completo | Júlio Verne`,
    });

    for (let i = 0; i < entry.capitulos.length; i++) {
      const cap = entry.capitulos[i];
      const sourcePath = path.join(folderPath, cap.arquivo);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Capítulo ausente: ${entry.pasta}/${cap.arquivo}`);
      }
      chapters.push({
        bookId,
        index: i + 1,
        label: cap.titulo,
        sourceFile: cap.arquivo,
        words: cap.palavras || 0,
      });
      totalChapters += 1;
    }
  }

  const { booksUpserted, chaptersUpserted } = await bulkUpsertBooksAndChapters(
    channelId,
    books,
    chapters
  );

  const settings = await getAudiobookSettings(channelId);
  await saveAudiobookSettings(channelId, settings.ttsVoice ? settings : DEFAULT_AUDIOBOOK_SETTINGS);

  const listed = await listBooksForChannel(channelId);
  return {
    packageRoot,
    packageName: JULIO_VERNE_PACKAGE,
    booksUpserted,
    chaptersUpserted,
    totalBooks: listed.length,
    totalChapters,
  };
}
