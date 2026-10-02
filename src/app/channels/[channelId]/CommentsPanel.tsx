"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Channel } from "../../../core/types";
import type {
  CommentStatus,
  YoutubeCommentRow,
  YoutubeCommentRun,
} from "../../../core/comments/types";
import { youtubeCommentUrl } from "../../../core/comments/replyBank";

type Counts = Record<CommentStatus, number>;

type ListTab = "pending" | "answered" | "needs_review" | "all";

export function CommentsPanel({ channel }: { channel: Channel }) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [hasForceSsl, setHasForceSsl] = useState(true);
  const [youtubeTitle, setYoutubeTitle] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>({
    pending: 0,
    answered: 0,
    skipped: 0,
    needs_review: 0,
    error: 0,
  });
  const [comments, setComments] = useState<YoutubeCommentRow[]>([]);
  const [listTab, setListTab] = useState<ListTab>("pending");
  const [maxItems, setMaxItems] = useState(50);
  const [customMax, setCustomMax] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [useRules, setUseRules] = useState(true);
  const [useAi, setUseAi] = useState(false);
  const [skipAnswered, setSkipAnswered] = useState(true);
  const [skipDelicate, setSkipDelicate] = useState(true);
  const [varyResponses, setVaryResponses] = useState(true);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<YoutubeCommentRun | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftReply, setDraftReply] = useState("");
  const [suggestBusy, setSuggestBusy] = useState(false);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = listTab === "all" ? "all" : listTab;
      const res = await fetch(
        `/api/channels/${channel.id}/comments?status=${status}&limit=80`
      );
      const json = await res.json().catch(() => ({}));
      if (typeof json.connected === "boolean") {
        setConnected(json.connected);
        setHasForceSsl(json.hasForceSsl !== false);
        setYoutubeTitle(json.youtubeTitle ?? null);
      }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setCounts(json.counts ?? counts);
      setComments(json.comments ?? []);
      if (json.latestRun) setRun(json.latestRun);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, listTab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function syncComments() {
    setSyncing(true);
    setError(null);
    try {
      let pageToken: string | undefined;
      let imported = 0;
      for (let page = 0; page < 10; page++) {
        const res = await fetch(`/api/channels/${channel.id}/comments/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxPages: 1, pageToken }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const detail =
            res.status === 504
              ? "La actualización tardó demasiado. Volvé a apretar Actualizar comentarios."
              : (json.error ?? `HTTP ${res.status}`);
          if (imported > 0) {
            throw new Error(`${detail} Ya se guardaron ${imported} comentarios.`);
          }
          throw new Error(detail);
        }
        imported += Number(json.imported) || 0;
        if (json.counts) setCounts(json.counts);
        pageToken = json.nextPageToken || undefined;
        if (!pageToken) break;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }

  function effectiveMax() {
    if (customMax.trim()) {
      const n = Number(customMax);
      if (Number.isFinite(n) && n > 0) return Math.min(100, Math.round(n));
    }
    return maxItems;
  }

  async function startAuto() {
    const max = effectiveMax();
    if (
      !confirm(
        dryRun
          ? `DRY RUN: se simularán hasta ${max} comentarios pendientes (nada se publica en YouTube).`
          : `Se procesarán hasta ${max} comentarios pendientes y se publicarán respuestas en YouTube.`
      )
    ) {
      return;
    }
    stopRef.current = false;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channel.id}/comments/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxItems: max,
          dryRun,
          skipDelicate,
          varyResponses,
          skipAlreadyAnswered: skipAnswered,
          useAi: useAi && !useRules ? true : false,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRun(json.run ?? null);
      if (json.run?.status === "quota_stopped") {
        setError("Automatización detenida por límite de YouTube.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function stopAuto() {
    stopRef.current = true;
    if (!run?.id) return;
    await fetch(`/api/channels/${channel.id}/comments/auto?runId=${run.id}`, {
      method: "DELETE",
    }).catch(() => undefined);
  }

  async function suggestFor(c: YoutubeCommentRow) {
    setSelectedId(c.id);
    setSuggestBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channel.id}/comments/${c.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suggest" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setDraftReply(json.suggestedReply || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSuggestBusy(false);
    }
  }

  async function manualAction(c: YoutubeCommentRow, action: "reply" | "skip") {
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channel.id}/comments/${c.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "skip"
            ? { action: "skip" }
            : { action: "reply", replyText: draftReply, dryRun: false }
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setDraftReply("");
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const selected = comments.find((c) => c.id === selectedId) ?? null;

  return (
    <section className="costs-section portadas-section comments-section">
      <header className="workspace-section-head">
        <div>
          <h2>{channel.name}</h2>
          <p>Comentarios de YouTube — respuestas por reglas (sin IA por defecto).</p>
        </div>
        <div className="portadas-actions">
          <button type="button" disabled={syncing || !connected} onClick={() => void syncComments()}>
            {syncing ? "Actualizando…" : "Actualizar comentarios"}
          </button>
        </div>
      </header>

      {!connected && (
        <p className="workspace-yt-error">
          YouTube no conectado. Ve a la pestaña <strong>YouTube</strong> → Conectar.
        </p>
      )}
      {connected && !hasForceSsl && (
        <p className="workspace-yt-error">
          Falta el permiso <code>youtube.force-ssl</code> para responder. Vuelve a{" "}
          <strong>Conectar YouTube</strong> (autoriza de nuevo).
        </p>
      )}
      {connected && youtubeTitle && (
        <p className="portadas-actions-hint">Canal: {youtubeTitle}</p>
      )}
      {error && <p className="workspace-yt-error">{error}</p>}

      <div className="comments-stats" style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "12px 0 20px" }}>
        <Stat label="Pendientes" value={counts.pending} />
        <Stat label="Respondidos" value={counts.answered} />
        <Stat label="Omitidos" value={counts.skipped} />
        <Stat label="Revisión" value={counts.needs_review} />
        <Stat label="Errores" value={counts.error} />
      </div>

      <div className="costs-block" style={{ marginBottom: 24 }}>
        <h3>AUTO RESPONDER</h3>
        <p className="portadas-actions-hint" style={{ marginBottom: 12 }}>
          Máximo por ejecución
        </p>
        <div className="portadas-count-pills" role="group" aria-label="Máximo">
          {[10, 25, 50, 100].map((n) => (
            <button
              key={n}
              type="button"
              className={maxItems === n && !customMax ? "active" : ""}
              onClick={() => {
                setMaxItems(n);
                setCustomMax("");
              }}
            >
              {n}
            </button>
          ))}
          <label className="portadas-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Personalizado
            <input
              type="number"
              min={1}
              max={100}
              value={customMax}
              onChange={(e) => setCustomMax(e.target.value)}
              style={{ width: 72 }}
            />
          </label>
        </div>

        <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
          <label>
            <input type="checkbox" checked={useRules} onChange={(e) => setUseRules(e.target.checked)} />{" "}
            Respuestas automáticas por reglas
          </label>
          <label>
            <input
              type="checkbox"
              checked={useAi}
              disabled
              onChange={(e) => setUseAi(e.target.checked)}
            />{" "}
            Usar IA para comentarios complejos <em>(próximamente)</em>
          </label>
          <label>
            <input
              type="checkbox"
              checked={skipAnswered}
              onChange={(e) => setSkipAnswered(e.target.checked)}
            />{" "}
            No responder comentarios ya respondidos
          </label>
          <label>
            <input
              type="checkbox"
              checked={skipDelicate}
              onChange={(e) => setSkipDelicate(e.target.checked)}
            />{" "}
            Omitir comentarios delicados (→ revisión)
          </label>
          <label>
            <input
              type="checkbox"
              checked={varyResponses}
              onChange={(e) => setVaryResponses(e.target.checked)}
            />{" "}
            Variar respuestas
          </label>
          <label>
            <input type="checkbox" checked disabled /> Guardar historial
          </label>
          <label>
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />{" "}
            <strong>Dry Run</strong> — no publica nada en YouTube
          </label>
        </div>

        <div className="portadas-actions" style={{ marginTop: 16, gap: 8 }}>
          <button type="button" disabled={running || !connected} onClick={() => void startAuto()}>
            {running ? "Procesando…" : "▶ Iniciar auto respuestas"}
          </button>
          {running && (
            <button type="button" onClick={() => void stopAuto()}>
              Detener
            </button>
          )}
        </div>

        {run && (
          <div style={{ marginTop: 16 }}>
            <p>
              Procesando {run.processed} / {run.maxItems}
              {run.dryRun ? " · DRY RUN" : ""} · {run.status}
            </p>
            <p className="portadas-actions-hint">
              Respondidos: {run.answered} · Omitidos: {run.skipped} · Revisión: {run.needsReview} ·
              Errores: {run.errors}
            </p>
            {run.status === "quota_stopped" && (
              <p className="workspace-yt-error">Automatización detenida por límite de YouTube.</p>
            )}
            <div
              className="comments-run-log"
              style={{
                maxHeight: 220,
                overflow: "auto",
                marginTop: 8,
                fontFamily: "ui-monospace, monospace",
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              {[...run.log].reverse().slice(0, 40).map((e, i) => (
                <div key={`${e.at}-${i}`}>
                  {e.action === "answered" || e.action === "dry_run" ? "✓" : e.action === "needs_review" ? "○" : "✗"}{" "}
                  @{e.authorName || "usuario"} —{" "}
                  {e.action === "dry_run"
                    ? `dry run [${e.category}]: ${e.replyText?.slice(0, 80)}`
                    : e.action === "answered"
                      ? "respondido"
                      : e.action === "needs_review"
                        ? "enviado a revisión"
                        : e.action === "skipped"
                          ? "omitido"
                          : e.message || "error"}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="portadas-count-pills" role="tablist" style={{ marginBottom: 12 }}>
        {(
          [
            ["pending", "Pendientes"],
            ["answered", "Respondidos"],
            ["needs_review", "Revisión"],
            ["all", "Todos"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={listTab === id ? "active" : ""}
            onClick={() => setListTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="portadas-actions-hint">Cargando…</p>
      ) : comments.length === 0 ? (
        <p className="portadas-actions-hint">
          Sin comentarios en esta vista. Pulsa «Actualizar comentarios».
        </p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {comments.map((c) => (
            <article
              key={c.id}
              className="costs-block"
              style={{ display: "grid", gap: 8, gridTemplateColumns: "48px 1fr" }}
            >
              <div>
                {c.authorProfileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.authorProfileImageUrl}
                    alt=""
                    width={40}
                    height={40}
                    style={{ borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: "#ddd",
                    }}
                  />
                )}
              </div>
              <div>
                <strong>{c.authorName || "Usuario"}</strong>{" "}
                <span className="portadas-actions-hint">
                  {c.publishedAt ? new Date(c.publishedAt).toLocaleString("es") : ""} · {c.status}
                  {c.category ? ` · ${c.category}` : ""}
                </span>
                <p style={{ margin: "6px 0" }}>{c.commentText}</p>
                {c.ourReplyText && (
                  <p className="portadas-actions-hint">
                    Respondido: <em>{c.ourReplyText}</em>
                  </p>
                )}
                <div className="portadas-actions" style={{ gap: 8, flexWrap: "wrap" }}>
                  <a
                    href={youtubeCommentUrl(c.videoId, c.youtubeCommentId)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver en YouTube
                  </a>
                  {c.status === "pending" || c.status === "needs_review" || c.status === "error" ? (
                    <>
                      <button type="button" disabled={suggestBusy} onClick={() => void suggestFor(c)}>
                        Sugerir
                      </button>
                      <button type="button" onClick={() => void manualAction(c, "skip")}>
                        Omitir
                      </button>
                    </>
                  ) : null}
                </div>
                {selectedId === c.id && (
                  <div style={{ marginTop: 10 }}>
                    <label className="portadas-label">
                      Respuesta
                      <textarea
                        rows={3}
                        value={draftReply}
                        onChange={(e) => setDraftReply(e.target.value)}
                        style={{ width: "100%", marginTop: 4 }}
                      />
                    </label>
                    <div className="portadas-actions" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        disabled={!draftReply.trim()}
                        onClick={() => void manualAction(c, "reply")}
                      >
                        Responder
                      </button>
                      <button type="button" onClick={() => setSelectedId(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {selected && !comments.some((c) => c.id === selected.id) && null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div className="portadas-actions-hint">{label}</div>
    </div>
  );
}
