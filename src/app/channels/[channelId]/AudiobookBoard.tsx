"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { Chapter } from "../../../core/types";
import { chapterSnap } from "./chapterProgress";
import { ChapterParts } from "./ChapterParts";

type BoardRow = Chapter & { bookTitle: string };

export function AudiobookBoard({ channelId }: { channelId: string }) {
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/channels/${channelId}/audiobook/board`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRows(json.chapters ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <section className="review-queue-section">
      <div className="workspace-section-title">
        <h2>Painel</h2>
        <p>Capítulos que já saíram de pendente. Áudio, imagens, animação, renderização, portada, descrição e YouTube.</p>
      </div>
      {loading && rows.length === 0 && <p className="books-muted">A carregar o painel…</p>}
      {error && <p className="generation-error">{error}</p>}
      {!loading && rows.length === 0 && (
        <p className="books-muted">
          Nada em produção. Em Livros, abre a obra e gera um capítulo ou um intervalo, do 1 ao número que quiseres.
        </p>
      )}
      {rows.length > 0 && (
        <ul className="control-list">
          {rows.map((c) => {
            const snap = chapterSnap(c);
            return (
              <li key={c.id} className={`control-row is-${snap.kind}`}>
                <div className="control-row-head">
                  <strong>
                    {c.bookTitle} · {c.index}. {c.label}
                  </strong>
                  <span>{snap.percent}%</span>
                </div>
                <div
                  className="control-bar"
                  role="progressbar"
                  aria-valuenow={snap.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${snap.percent}%` }} />
                </div>
                <small>{snap.stage}</small>
                <ChapterParts parts={snap.parts} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
