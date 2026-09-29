"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { BookListItem, Chapter } from "../../../core/types";

type BookDetail = {
  book: BookListItem | (BookListItem & Record<string, unknown>);
  chapters: Chapter[];
};

const STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  in_progress: "Em produção",
  completed: "Concluída",
  paused: "Pausada",
  pending: "Pendente",
  text_ready: "Texto pronto",
  tts_running: "TTS…",
  audio_ready: "Áudio",
  images_ready: "Imagens",
  video_ready: "Vídeo",
  thumb_ready: "Thumb",
  uploading: "Upload…",
  uploaded: "Enviado",
  scheduled: "Agendado",
  published: "Publicado",
  failed: "Falhou",
};

type Props = {
  channelId: string;
  onGoToVoice?: () => void;
};

export function BooksPanel({ channelId, onGoToVoice }: Props) {
  const [books, setBooks] = useState<BookListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [autoImported, setAutoImported] = useState(false);
  const [query, setQuery] = useState("");
  const [voiceLabel, setVoiceLabel] = useState<string | null>(null);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/books`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setBooks(json.books ?? []);
      return (json.books ?? []) as BookListItem[];
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBooks([]);
      return [] as BookListItem[];
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  useEffect(() => {
    void fetch(`/api/channels/${channelId}/audiobook/settings`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const voice = String(json.settings?.ttsVoice ?? "");
        setVoiceLabel(voice.replace("pt-BR-Chirp3-HD-", "") || null);
      })
      .catch(() => undefined);
  }, [channelId]);

  // First visit with empty catalog → import the Verne package once.
  useEffect(() => {
    if (loading || autoImported || books.length > 0 || importing) return;
    setAutoImported(true);
    void (async () => {
      setImporting(true);
      setError(null);
      try {
        const res = await fetch(`/api/channels/${channelId}/books/import`, { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setMessage(`Catálogo carregado: ${json.totalBooks} obras · ${json.totalChapters} capítulos.`);
        await loadBooks();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setImporting(false);
      }
    })();
  }, [loading, autoImported, books.length, importing, channelId, loadBooks]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/channels/${channelId}/books/${selectedId}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!cancelled) setDetail({ book: json.book, chapters: json.chapters ?? [] });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, selectedId]);

  async function onImport() {
    setImporting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/books/import`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setMessage(`Atualizado: ${json.totalBooks} obras · ${json.totalChapters} capítulos.`);
      await loadBooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        String(b.orderIndex + 1).includes(q) ||
        String(b.number).includes(q)
    );
  }, [books, query]);

  const totalChapters = books.reduce((s, b) => s + b.totalChapters, 0);
  const doneChapters = books.reduce((s, b) => s + b.chaptersDone, 0);
  const currentBook =
    books.find((b) => b.status === "in_progress") ?? books.find((b) => b.status === "queued");

  if (selectedId) {
    return (
      <div className="books-panel">
        <div className="books-panel-toolbar">
          <button type="button" className="books-back" onClick={() => setSelectedId(null)}>
            ← Todas as obras
          </button>
        </div>
        {detailLoading && <p className="books-muted">Carregando capítulos…</p>}
        {detail && (
          <>
            <header className="books-detail-header">
              <h2>{detail.book.title}</h2>
              <p className="books-muted">
                Produção #{(detail.book.orderIndex ?? 0) + 1} ·{" "}
                {STATUS_LABEL[detail.book.status] ?? detail.book.status} · {detail.chapters.length}{" "}
                capítulos · ~{Math.round((detail.book.totalWords / 150) * 10) / 10} min
              </p>
              <p className="books-muted" style={{ marginTop: 4 }}>
                Cada linha = 1 vídeo no YouTube. Produzir na ordem do capítulo 1 ao último.
                {voiceLabel ? ` Voz do canal: ${voiceLabel}.` : ""}
              </p>
            </header>
            <div className="books-table-wrap">
              <table className="books-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Capítulo</th>
                    <th>Palavras</th>
                    <th>Chars</th>
                    <th>~ min</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.chapters.map((c) => (
                    <tr key={c.id}>
                      <td>{c.index}</td>
                      <td>{c.label}</td>
                      <td>{c.words.toLocaleString("pt-BR")}</td>
                      <td>{c.chars.toLocaleString("pt-BR")}</td>
                      <td>{Math.round((c.words / 150) * 10) / 10}</td>
                      <td>
                        <span className={`books-status books-status-${c.status}`}>
                          {STATUS_LABEL[c.status] ?? c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {error && <p className="generation-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="books-panel">
      <div className="books-hero">
        <div>
          <h2>Obras de Júlio Verne</h2>
          <p>
            Catálogo completo — uma obra de cada vez, capítulo a capítulo.{" "}
            <strong>1 capítulo = 1 vídeo</strong> na playlist da obra. Sem ideias/roteiros virais:
            escolhe a obra, define a voz, gera.
          </p>
          {books.length > 0 && (
            <p className="books-muted" style={{ marginTop: 8 }}>
              {books.length} obras · {doneChapters}/{totalChapters} capítulos feitos
              {currentBook ? ` · a seguir: ${currentBook.title}` : ""}
            </p>
          )}
        </div>
        <button type="button" className="books-import-btn" disabled={importing} onClick={() => void onImport()}>
          {importing ? "A carregar…" : books.length === 0 ? "Carregar catálogo" : "Atualizar catálogo"}
        </button>
      </div>

      <div className="books-voice-banner">
        <div>
          <strong>Antes de gerar:</strong> define a voz Chirp (Charon / Orus / Fenrir)
          {voiceLabel ? (
            <>
              {" "}
              — atual: <em>{voiceLabel}</em>
            </>
          ) : (
            " na aba Áudio"
          )}
          .
        </div>
        {onGoToVoice && (
          <button type="button" className="books-back" onClick={onGoToVoice}>
            Definir voz →
          </button>
        )}
      </div>

      {books.length > 0 && (
        <label className="books-search">
          <span className="visually-hidden">Filtrar obras</span>
          <input
            type="search"
            placeholder="Filtrar por título ou nº…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}

      {message && <p className="books-ok">{message}</p>}
      {error && <p className="generation-error">{error}</p>}
      {(loading || importing) && books.length === 0 && (
        <p className="books-muted">A carregar novelas e capítulos…</p>
      )}

      {!loading && !importing && books.length === 0 && (
        <p className="books-muted">
          Ainda sem obras. O pacote deve estar em{" "}
          <code>data/books/julio_verne_capitulos/</code>.
        </p>
      )}

      {filtered.length > 0 && (
        <div className="books-grid">
          {filtered.map((b) => {
            const pct =
              b.totalChapters > 0 ? Math.round((b.chaptersDone / b.totalChapters) * 100) : 0;
            const isNext = currentBook?.id === b.id;
            return (
              <button
                key={b.id}
                type="button"
                className={`books-card${isNext ? " is-next" : ""}`}
                onClick={() => setSelectedId(b.id)}
              >
                <div className="books-card-top">
                  <span className="books-card-order">#{b.orderIndex + 1}</span>
                  <span className={`books-status books-status-${b.status}`}>
                    {STATUS_LABEL[b.status] ?? b.status}
                  </span>
                </div>
                <strong className="books-card-title">{b.title}</strong>
                <div className="books-card-meta">
                  {b.chaptersDone}/{b.totalChapters} capítulos ·{" "}
                  {b.totalWords.toLocaleString("pt-BR")} palavras · ~{b.estimatedMinutes} min
                </div>
                <div className="books-card-bar" aria-hidden>
                  <i style={{ width: `${pct}%` }} />
                </div>
                {isNext && <span className="books-card-next">Obra atual na fila</span>}
              </button>
            );
          })}
        </div>
      )}

      {books.length > 0 && filtered.length === 0 && (
        <p className="books-muted">Nenhuma obra corresponde a «{query}».</p>
      )}
    </div>
  );
}
