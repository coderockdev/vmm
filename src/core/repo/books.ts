import { createHash } from "crypto";
import { getDb } from "../db";
import { getSupabase, isSupabaseEnabled, assertNoError } from "../supabaseClient";
import {
  Book,
  BookListItem,
  BookStatus,
  Chapter,
  ChapterStatus,
  ChannelAudiobookSettings,
  DEFAULT_AUDIOBOOK_SETTINGS,
} from "../types";

interface BookRow {
  id: string;
  channel_id: string;
  order_index: number;
  number: number;
  title: string;
  folder: string;
  total_chapters: number;
  total_chars: number;
  total_words: number;
  status: string;
  youtube_playlist_id: string | null;
  playlist_title: string | null;
  playlist_description: string | null;
  created_at: string;
  updated_at: string;
}

interface ChapterRow {
  id: string;
  book_id: string;
  chapter_index: number;
  label: string;
  source_file: string;
  words: number;
  chars: number;
  status: string;
  tts_text_path: string | null;
  audio_path: string | null;
  audio_duration_sec: number | null;
  video_path: string | null;
  thumb_path: string | null;
  image_prompts_json: string | object | null;
  image_paths_json: string | object | null;
  youtube_video_id: string | null;
  youtube_url: string | null;
  publish_at: string | null;
  error_message: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

const DONE_CHAPTER_STATUSES = new Set<ChapterStatus>([
  "video_ready",
  "thumb_ready",
  "uploading",
  "uploaded",
  "scheduled",
  "published",
]);

/** Stable id so reimport never duplicates rows. */
export function stableBookId(channelId: string, folder: string): string {
  const h = createHash("sha1").update(`${channelId}|${folder}`).digest("hex").slice(0, 20);
  return `bk_${h}`;
}

export function stableChapterId(bookId: string, sourceFile: string): string {
  const h = createHash("sha1").update(`${bookId}|${sourceFile}`).digest("hex").slice(0, 20);
  return `ch_${h}`;
}

function parseJsonArray<T>(raw: string | object | null): T | null {
  if (raw == null) return null;
  if (typeof raw === "object") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function rowToBook(row: BookRow): Book {
  return {
    id: row.id,
    channelId: row.channel_id,
    orderIndex: row.order_index,
    number: row.number,
    title: row.title,
    folder: row.folder,
    totalChapters: row.total_chapters,
    totalChars: row.total_chars,
    totalWords: row.total_words,
    status: row.status as BookStatus,
    youtubePlaylistId: row.youtube_playlist_id,
    playlistTitle: row.playlist_title,
    playlistDescription: row.playlist_description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToChapter(row: ChapterRow): Chapter {
  return {
    id: row.id,
    bookId: row.book_id,
    index: row.chapter_index,
    label: row.label,
    sourceFile: row.source_file,
    words: row.words,
    chars: row.chars,
    status: row.status as ChapterStatus,
    ttsTextPath: row.tts_text_path,
    audioPath: row.audio_path,
    audioDurationSec: row.audio_duration_sec,
    videoPath: row.video_path,
    thumbPath: row.thumb_path,
    imagePrompts: parseJsonArray(row.image_prompts_json),
    imagePaths: parseJsonArray(row.image_paths_json),
    youtubeVideoId: row.youtube_video_id,
    youtubeUrl: row.youtube_url,
    publishAt: row.publish_at,
    errorMessage: row.error_message,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listBooksForChannel(channelId: string): Promise<BookListItem[]> {
  if (isSupabaseEnabled()) {
    const booksRes = await getSupabase()
      .from("books")
      .select("*")
      .eq("channel_id", channelId)
      .order("order_index", { ascending: true });
    const books = assertNoError(booksRes).map(rowToBook);
    if (books.length === 0) return [];

    const chaptersRes = await getSupabase()
      .from("chapters")
      .select("book_id, status")
      .in(
        "book_id",
        books.map((b) => b.id)
      );
    const chapterRows = assertNoError(chaptersRes) as Array<{
      book_id: string;
      status: string;
    }>;

    const doneByBook = new Map<string, number>();
    for (const c of chapterRows) {
      if (DONE_CHAPTER_STATUSES.has(c.status as ChapterStatus)) {
        doneByBook.set(c.book_id, (doneByBook.get(c.book_id) ?? 0) + 1);
      }
    }

    return books.map((b) => ({
      ...b,
      chaptersDone: doneByBook.get(b.id) ?? 0,
      estimatedMinutes: Math.round((b.totalWords / 150) * 10) / 10,
    }));
  }

  const db = getDb();
  const books = (
    db
      .prepare(`SELECT * FROM books WHERE channel_id = ? ORDER BY order_index ASC`)
      .all(channelId) as BookRow[]
  ).map(rowToBook);

  if (books.length === 0) return [];

  const placeholders = books.map(() => "?").join(",");
  const chapterRows = db
    .prepare(`SELECT book_id, status FROM chapters WHERE book_id IN (${placeholders})`)
    .all(...books.map((b) => b.id)) as Array<{ book_id: string; status: string }>;

  const doneByBook = new Map<string, number>();
  for (const c of chapterRows) {
    if (DONE_CHAPTER_STATUSES.has(c.status as ChapterStatus)) {
      doneByBook.set(c.book_id, (doneByBook.get(c.book_id) ?? 0) + 1);
    }
  }

  return books.map((b) => ({
    ...b,
    chaptersDone: doneByBook.get(b.id) ?? 0,
    estimatedMinutes: Math.round((b.totalWords / 150) * 10) / 10,
  }));
}

export async function getBook(bookId: string): Promise<Book | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase().from("books").select("*").eq("id", bookId).maybeSingle();
    const row = assertNoError(res);
    return row ? rowToBook(row as BookRow) : null;
  }
  const row = getDb().prepare(`SELECT * FROM books WHERE id = ?`).get(bookId) as BookRow | undefined;
  return row ? rowToBook(row) : null;
}

export async function getBookByFolder(
  channelId: string,
  folder: string
): Promise<Book | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("books")
      .select("*")
      .eq("channel_id", channelId)
      .eq("folder", folder)
      .maybeSingle();
    const row = assertNoError(res);
    return row ? rowToBook(row as BookRow) : null;
  }
  const row = getDb()
    .prepare(`SELECT * FROM books WHERE channel_id = ? AND folder = ?`)
    .get(channelId, folder) as BookRow | undefined;
  return row ? rowToBook(row) : null;
}

export async function getChapter(chapterId: string): Promise<Chapter | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase().from("chapters").select("*").eq("id", chapterId).maybeSingle();
    const row = assertNoError(res);
    return row ? rowToChapter(row as ChapterRow) : null;
  }
  const row = getDb().prepare(`SELECT * FROM chapters WHERE id = ?`).get(chapterId) as
    | ChapterRow
    | undefined;
  return row ? rowToChapter(row) : null;
}

export type ChapterBoardItem = Chapter & { bookTitle: string };

export async function listChapterBoard(channelId: string): Promise<ChapterBoardItem[]> {
  const attach = (chapters: Chapter[], titles: Map<string, string>): ChapterBoardItem[] =>
    chapters
      .filter((c) => c.status !== "pending")
      .map((c) => ({ ...c, bookTitle: titles.get(c.bookId) ?? "" }))
      .sort((a, b) => {
        const rank = (c: Chapter) => (c.status === "tts_running" || c.status === "uploading" ? 0 : 1);
        const byQueue = rank(a) - rank(b);
        if (byQueue !== 0) return byQueue;
        // The fila is first-in: chapter 1 (queued earlier) stays above chapter N.
        if (rank(a) === 0) return a.updatedAt < b.updatedAt ? -1 : 1;
        return a.updatedAt < b.updatedAt ? 1 : -1;
      });

  if (isSupabaseEnabled()) {
    const booksRes = await getSupabase().from("books").select("id,title").eq("channel_id", channelId);
    const books = assertNoError(booksRes) as Array<{ id: string; title: string }>;
    if (books.length === 0) return [];
    const titles = new Map(books.map((b) => [b.id, b.title]));
    const res = await getSupabase()
      .from("chapters")
      .select("*")
      .in(
        "book_id",
        books.map((b) => b.id)
      )
      .neq("status", "pending");
    return attach(assertNoError(res).map((row) => rowToChapter(row as ChapterRow)), titles);
  }

  const bookRows = getDb()
    .prepare(`SELECT id, title FROM books WHERE channel_id = ?`)
    .all(channelId) as Array<{ id: string; title: string }>;
  if (bookRows.length === 0) return [];
  const titles = new Map(bookRows.map((b) => [b.id, b.title]));
  const placeholders = bookRows.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT * FROM chapters WHERE book_id IN (${placeholders}) AND status != 'pending'`
    )
    .all(...bookRows.map((b) => b.id)) as ChapterRow[];
  return attach(rows.map(rowToChapter), titles);
}

export async function requestChapterProduction(
  chapterId: string,
  mode: "audio" | "full",
  at?: string
): Promise<Chapter | null> {
  const current = await getChapter(chapterId);
  if (!current) return null;
  const now = at ?? new Date().toISOString();
  const note =
    mode === "full"
      ? "Na fila: sequência completa (áudio, vídeo, portada, descrição, YouTube)."
      : "Na fila: só áudio.";
  const nextStatus: ChapterStatus =
    current.audioPath && mode === "audio" ? "audio_ready" : "tts_running";
  const patch = {
    status: nextStatus,
    error_message: note,
    attempts: current.attempts + 1,
    updated_at: now,
  };
  if (isSupabaseEnabled()) {
    const res = await getSupabase().from("chapters").update(patch).eq("id", chapterId).select("*").maybeSingle();
    const row = assertNoError(res);
    return row ? rowToChapter(row as ChapterRow) : null;
  }
  getDb()
    .prepare(
      `UPDATE chapters SET status = ?, error_message = ?, attempts = ?, updated_at = ? WHERE id = ?`
    )
    .run(patch.status, patch.error_message, patch.attempts, patch.updated_at, chapterId);
  return getChapter(chapterId);
}

const QUEUEABLE: ChapterStatus[] = ["pending", "text_ready", "failed"];

/** Chapters 1..toIndex, in order, using the same fila mark as one chapter. */
export async function requestChapterRange(
  bookId: string,
  toIndex: number,
  mode: "audio" | "full"
): Promise<{ queued: Chapter[]; skipped: number }> {
  const chapters = await listChaptersForBook(bookId);
  const slice = chapters.filter((c) => c.index >= 1 && c.index <= toIndex);
  const queued: Chapter[] = [];
  let skipped = 0;
  const base = Date.now();
  for (const chapter of slice) {
    if (!QUEUEABLE.includes(chapter.status)) {
      skipped += 1;
      continue;
    }
    const saved = await requestChapterProduction(
      chapter.id,
      mode,
      new Date(base + chapter.index).toISOString()
    );
    if (saved) queued.push(saved);
  }
  if (queued.length > 0) await markBookInProgress(bookId);
  return { queued, skipped };
}

async function markBookInProgress(bookId: string): Promise<void> {
  const book = await getBook(bookId);
  if (!book || book.status === "in_progress" || book.status === "completed") return;
  const now = new Date().toISOString();
  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("books")
      .update({ status: "in_progress", updated_at: now })
      .eq("id", bookId);
    assertNoError(res);
    return;
  }
  getDb().prepare(`UPDATE books SET status = ?, updated_at = ? WHERE id = ?`).run("in_progress", now, bookId);
}

export async function listChaptersForBook(bookId: string): Promise<Chapter[]> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("chapters")
      .select("*")
      .eq("book_id", bookId)
      .order("chapter_index", { ascending: true });
    return assertNoError(res).map(rowToChapter);
  }
  const rows = getDb()
    .prepare(`SELECT * FROM chapters WHERE book_id = ? ORDER BY chapter_index ASC`)
    .all(bookId) as ChapterRow[];
  return rows.map(rowToChapter);
}

export type BulkBookInput = {
  channelId: string;
  orderIndex: number;
  number: number;
  title: string;
  folder: string;
  totalChapters: number;
  totalChars: number;
  totalWords: number;
  playlistTitle?: string;
};

export type BulkChapterInput = {
  bookId: string;
  index: number;
  label: string;
  sourceFile: string;
  words: number;
};

/**
 * Fast idempotent bulk import: few round-trips (books once + chapter chunks).
 * Uses stable IDs; preserves existing chapter status/chars/attempts on conflict.
 */
export async function bulkUpsertBooksAndChapters(
  channelId: string,
  books: BulkBookInput[],
  chapters: BulkChapterInput[]
): Promise<{ booksUpserted: number; chaptersUpserted: number }> {
  const now = new Date().toISOString();

  if (isSupabaseEnabled()) {
    const sb = getSupabase();

    const existingBooksRes = await sb
      .from("books")
      .select("id, folder, status, youtube_playlist_id, playlist_title, playlist_description, created_at")
      .eq("channel_id", channelId);
    const existingBooks = assertNoError(existingBooksRes) as Array<{
      id: string;
      folder: string;
      status: string;
      youtube_playlist_id: string | null;
      playlist_title: string | null;
      playlist_description: string | null;
      created_at: string;
    }>;
    const bookByFolder = new Map(existingBooks.map((b) => [b.folder, b]));

    const bookPayloads = books.map((b) => {
      const prev = bookByFolder.get(b.folder);
      const id = prev?.id ?? stableBookId(channelId, b.folder);
      return {
        id,
        channel_id: channelId,
        order_index: b.orderIndex,
        number: b.number,
        title: b.title,
        folder: b.folder,
        total_chapters: b.totalChapters,
        total_chars: b.totalChars,
        total_words: b.totalWords,
        status: prev?.status ?? "queued",
        youtube_playlist_id: prev?.youtube_playlist_id ?? null,
        playlist_title:
          prev?.playlist_title ??
          b.playlistTitle ??
          `${b.title} — Audiolivro Completo | Júlio Verne`,
        playlist_description: prev?.playlist_description ?? null,
        created_at: prev?.created_at ?? now,
        updated_at: now,
      };
    });

    // Remap chapter bookIds (stable) → resolved ids (may reuse older random ids).
    const resolvedBookIdByFolder = new Map(bookPayloads.map((b) => [b.folder, b.id]));
    const stableToFolder = new Map(books.map((b) => [stableBookId(channelId, b.folder), b.folder]));

    const resBooks = await sb.from("books").upsert(bookPayloads, { onConflict: "channel_id,folder" });
    assertNoError(resBooks);

    const bookIds = bookPayloads.map((b) => b.id);
    const existingChaptersRes = await sb
      .from("chapters")
      .select("id, book_id, source_file, status, chars, attempts, created_at")
      .in("book_id", bookIds);
    const existingChapters = assertNoError(existingChaptersRes) as Array<{
      id: string;
      book_id: string;
      source_file: string;
      status: string;
      chars: number;
      attempts: number;
      created_at: string;
    }>;
    const chapterKey = (bookId: string, file: string) => `${bookId}::${file}`;
    const byKey = new Map(existingChapters.map((c) => [chapterKey(c.book_id, c.source_file), c]));

    const chapterPayloads = chapters.map((c) => {
      const folder = stableToFolder.get(c.bookId);
      const bookId = folder ? resolvedBookIdByFolder.get(folder)! : c.bookId;
      const prev = byKey.get(chapterKey(bookId, c.sourceFile));
      const id = prev?.id ?? stableChapterId(bookId, c.sourceFile);
      return {
        id,
        book_id: bookId,
        chapter_index: c.index,
        label: c.label,
        source_file: c.sourceFile,
        words: c.words,
        chars: prev?.chars ?? 0,
        status: prev?.status ?? "pending",
        attempts: prev?.attempts ?? 0,
        created_at: prev?.created_at ?? now,
        updated_at: now,
      };
    });

    const chunkSize = 400;
    for (let i = 0; i < chapterPayloads.length; i += chunkSize) {
      const chunk = chapterPayloads.slice(i, i + chunkSize);
      const res = await sb.from("chapters").upsert(chunk, { onConflict: "book_id,source_file" });
      assertNoError(res);
    }

    return { booksUpserted: bookPayloads.length, chaptersUpserted: chapterPayloads.length };
  }

  // SQLite path
  const db = getDb();
  const existingBooks = db
    .prepare(
      `SELECT id, folder, status, youtube_playlist_id, playlist_title, playlist_description, created_at
       FROM books WHERE channel_id = ?`
    )
    .all(channelId) as Array<{
    id: string;
    folder: string;
    status: string;
    youtube_playlist_id: string | null;
    playlist_title: string | null;
    playlist_description: string | null;
    created_at: string;
  }>;
  const bookByFolder = new Map(existingBooks.map((b) => [b.folder, b]));

  const upsertBookStmt = db.prepare(
    `INSERT INTO books (
      id, channel_id, order_index, number, title, folder,
      total_chapters, total_chars, total_words, status,
      youtube_playlist_id, playlist_title, playlist_description,
      created_at, updated_at
    ) VALUES (
      @id, @channelId, @orderIndex, @number, @title, @folder,
      @totalChapters, @totalChars, @totalWords, @status,
      @youtubePlaylistId, @playlistTitle, @playlistDescription,
      @createdAt, @updatedAt
    )
    ON CONFLICT(channel_id, folder) DO UPDATE SET
      order_index = excluded.order_index,
      number = excluded.number,
      title = excluded.title,
      total_chapters = excluded.total_chapters,
      total_chars = excluded.total_chars,
      total_words = excluded.total_words,
      playlist_title = COALESCE(books.playlist_title, excluded.playlist_title),
      updated_at = excluded.updated_at`
  );

  const upsertChapterStmt = db.prepare(
    `INSERT INTO chapters (
      id, book_id, chapter_index, label, source_file, words, chars, status,
      attempts, created_at, updated_at
    ) VALUES (
      @id, @bookId, @index, @label, @sourceFile, @words, @chars, @status,
      @attempts, @createdAt, @updatedAt
    )
    ON CONFLICT(book_id, source_file) DO UPDATE SET
      chapter_index = excluded.chapter_index,
      label = excluded.label,
      words = excluded.words,
      updated_at = excluded.updated_at`
  );

  const selectChapter = db.prepare(
    `SELECT id, status, chars, attempts, created_at FROM chapters WHERE book_id = ? AND source_file = ?`
  );

  const resolved = new Map<string, string>();
  const tx = db.transaction(() => {
    for (const b of books) {
      const prev = bookByFolder.get(b.folder);
      const id = prev?.id ?? stableBookId(channelId, b.folder);
      resolved.set(b.folder, id);
      upsertBookStmt.run({
        id,
        channelId,
        orderIndex: b.orderIndex,
        number: b.number,
        title: b.title,
        folder: b.folder,
        totalChapters: b.totalChapters,
        totalChars: b.totalChars,
        totalWords: b.totalWords,
        status: prev?.status ?? "queued",
        youtubePlaylistId: prev?.youtube_playlist_id ?? null,
        playlistTitle:
          prev?.playlist_title ??
          b.playlistTitle ??
          `${b.title} — Audiolivro Completo | Júlio Verne`,
        playlistDescription: prev?.playlist_description ?? null,
        createdAt: prev?.created_at ?? now,
        updatedAt: now,
      });
    }

    const stableToFolder = new Map(books.map((b) => [stableBookId(channelId, b.folder), b.folder]));
    for (const c of chapters) {
      const folder = stableToFolder.get(c.bookId);
      const bookId = folder ? resolved.get(folder)! : c.bookId;
      const prev = selectChapter.get(bookId, c.sourceFile) as
        | { id: string; status: string; chars: number; attempts: number; created_at: string }
        | undefined;
      upsertChapterStmt.run({
        id: prev?.id ?? stableChapterId(bookId, c.sourceFile),
        bookId,
        index: c.index,
        label: c.label,
        sourceFile: c.sourceFile,
        words: c.words,
        chars: prev?.chars ?? 0,
        status: prev?.status ?? "pending",
        attempts: prev?.attempts ?? 0,
        createdAt: prev?.created_at ?? now,
        updatedAt: now,
      });
    }
  });
  tx();

  return { booksUpserted: books.length, chaptersUpserted: chapters.length };
}

export async function getAudiobookSettings(
  channelId: string
): Promise<ChannelAudiobookSettings> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("channel_audiobook_settings")
      .select("settings_json")
      .eq("channel_id", channelId)
      .maybeSingle();
    const row = assertNoError(res) as { settings_json: ChannelAudiobookSettings | string } | null;
    if (!row) return { ...DEFAULT_AUDIOBOOK_SETTINGS };
    const parsed =
      typeof row.settings_json === "string"
        ? (JSON.parse(row.settings_json) as ChannelAudiobookSettings)
        : row.settings_json;
    return { ...DEFAULT_AUDIOBOOK_SETTINGS, ...parsed };
  }

  const row = getDb()
    .prepare(`SELECT settings_json FROM channel_audiobook_settings WHERE channel_id = ?`)
    .get(channelId) as { settings_json: string } | undefined;
  if (!row) return { ...DEFAULT_AUDIOBOOK_SETTINGS };
  try {
    return { ...DEFAULT_AUDIOBOOK_SETTINGS, ...JSON.parse(row.settings_json) };
  } catch {
    return { ...DEFAULT_AUDIOBOOK_SETTINGS };
  }
}

export async function saveAudiobookSettings(
  channelId: string,
  settings: ChannelAudiobookSettings
): Promise<ChannelAudiobookSettings> {
  const now = new Date().toISOString();
  const merged = { ...DEFAULT_AUDIOBOOK_SETTINGS, ...settings };

  if (isSupabaseEnabled()) {
    const res = await getSupabase().from("channel_audiobook_settings").upsert({
      channel_id: channelId,
      settings_json: merged,
      updated_at: now,
    });
    assertNoError(res);
    return merged;
  }

  getDb()
    .prepare(
      `INSERT INTO channel_audiobook_settings (channel_id, settings_json, updated_at)
       VALUES (@channelId, @settings, @updatedAt)
       ON CONFLICT(channel_id) DO UPDATE SET
         settings_json = excluded.settings_json,
         updated_at = excluded.updated_at`
    )
    .run({
      channelId,
      settings: JSON.stringify(merged),
      updatedAt: now,
    });
  return merged;
}
