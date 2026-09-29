"use client";

import React, { useCallback, useEffect, useState } from "react";
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

export function BooksPanel({ channelId }: { channelId: string }) {
  const [books, setBooks] = useState<BookListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/books`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setBooks(json.books ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

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
      setMessage(
        `Importado: ${json.totalBooks} obras, ${json.totalChapters} capítulos (idempotente).`
      );
      await loadBooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  if (selectedId) {
    return (
      <div className="books-panel">
        <div className="books-panel-toolbar">
          <button type="button" className="books-back" onClick={() => setSelectedId(null)}>
            ← Voltar às obras
          </button>
        </div>
        {detailLoading && <p className="books-muted">Carregando capítulos…</p>}
        {detail && (
          <>
            <header className="books-detail-header">
              <h2>{detail.book.title}</h2>
              <p className="books-muted">
                {STATUS_LABEL[detail.book.status] ?? detail.book.status} · {detail.chapters.length}{" "}
                capítulos · ~{Math.round((detail.book.totalWords / 150) * 10) / 10} min · pasta{" "}
                <code>{detail.book.folder}</code>
              </p>
            </header>
            <div className="books-table-wrap">
              <table className="books-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Capítulo</th>
                    <th>Palavras</th>
                    <th>Status</th>
                    <th>Arquivo</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.chapters.map((c) => (
                    <tr key={c.id}>
                      <td>{c.index}</td>
                      <td>{c.label}</td>
                      <td>{c.words.toLocaleString("pt-BR")}</td>
                      <td>
                        <span className={`books-status books-status-${c.status}`}>
                          {STATUS_LABEL[c.status] ?? c.status}
                        </span>
                      </td>
                      <td>
                        <code>{c.sourceFile}</code>
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
      <div className="books-panel-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Livros</h2>
          <p className="books-muted" style={{ margin: "4px 0 0" }}>
            Ordem de produção · 1 capítulo = 1 vídeo
          </p>
        </div>
        <button type="button" className="books-import-btn" disabled={importing} onClick={() => void onImport()}>
          {importing ? "Importando…" : books.length === 0 ? "Importar pacote" : "Reimportar pacote"}
        </button>
      </div>

      {message && <p className="books-ok">{message}</p>}
      {error && <p className="generation-error">{error}</p>}
      {loading && <p className="books-muted">Carregando obras…</p>}

      {!loading && books.length === 0 && (
        <p className="books-muted">
          Nenhuma obra no banco. Clique em <strong>Importar pacote</strong> para ler{" "}
          <code>data/books/julio_verne_capitulos/indice.json</code>.
        </p>
      )}

      {!loading && books.length > 0 && (
        <div className="books-table-wrap">
          <table className="books-table">
            <thead>
              <tr>
                <th>Ordem</th>
                <th>Obra</th>
                <th>Status</th>
                <th>Capítulos</th>
                <th>Palavras</th>
                <th>~ min</th>
              </tr>
            </thead>
            <tbody>
              {books.map((b) => (
                <tr key={b.id} className="books-row-click" onClick={() => setSelectedId(b.id)}>
                  <td>{b.orderIndex + 1}</td>
                  <td>
                    <strong>{b.title}</strong>
                    <div className="books-muted" style={{ fontSize: 12 }}>
                      #{b.number} · {b.folder}
                    </div>
                  </td>
                  <td>{STATUS_LABEL[b.status] ?? b.status}</td>
                  <td>
                    {b.chaptersDone}/{b.totalChapters}
                  </td>
                  <td>{b.totalWords.toLocaleString("pt-BR")}</td>
                  <td>{b.estimatedMinutes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
