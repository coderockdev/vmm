"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { VideoFormat } from "../../../core/types";
import { formatUsd } from "../../../core/usage/types";
import { OutputMark } from "./ChannelSubjectGenerator";

export interface ChannelIdeaRow {
  id: string;
  planId: string;
  title: string;
  angle: string;
  objective: string;
  format: VideoFormat;
  durationMinutes: number;
  titleCostUsd: number | null;
  scriptCostUsd: number | null;
  project: {
    id: string;
    status: string;
    scriptId: string | null;
    updatedAt: string;
  } | null;
}

type FormatFilter = "all" | "video" | "short";
type IdeaDraft = Pick<ChannelIdeaRow, "title" | "angle" | "objective">;
type ScriptContextSection = { title: string; items: Array<{ label: string; value: string }> };
type ScriptDefaults = { sceneCount: number; wordCount: number };
const SCENE_COUNTS = [3, 4, 5, 6, 7, 8] as const;
const PAGE_SIZE = 6;

function Icon({ name }: { name: "eye" | "edit" | "trash" | "previous" | "next" }) {
  const paths = {
    eye: <><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.7" /></>,
    edit: <><path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5Z" /><path d="m13.9 6.6 3.5 3.5" /></>,
    trash: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
    previous: <path d="m15 18-6-6 6-6" />,
    next: <path d="m9 18 6-6-6-6" />,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function formatLabel(format: VideoFormat) {
  if (format === "both") return "YouTube + Shorts";
  return format === "short" ? "Shorts" : "YouTube";
}

function statusInfo(row: ChannelIdeaRow) {
  const project = row.project;
  if (!project) return { label: "Pendente", detail: "Aguardando geração", kind: "pending" };
  if (project.status === "failed") return { label: "Erro", detail: "Falha na geração", kind: "failed" };
  if (["audio", "timing", "composing", "rendering"].includes(project.status)) {
    return { label: "Em produção", detail: "Roteiro em produção", kind: "working" };
  }
  if (project.scriptId) return { label: "Pronto", detail: "Roteiro gerado", kind: "ready" };
  return { label: "Pendente", detail: "Aguardando geração", kind: "pending" };
}

function dateLabel(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function relativeDateLabel(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60_000);
  const absoluteMinutes = Math.abs(diffMinutes);
  const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (absoluteMinutes < 60) return relative.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return relative.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 365) return relative.format(diffDays, "day");
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
}

export function ChannelIdeasTable({ channelId, initialRows, scriptContext, scriptDefaults }: { channelId: string; initialRows: ChannelIdeaRow[]; scriptContext: ScriptContextSection[]; scriptDefaults: ScriptDefaults }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState<FormatFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ChannelIdeaRow | null>(null);
  const [reading, setReading] = useState<{ title: string; text: string } | null>(null);
  const [readingBusy, setReadingBusy] = useState(false);
  const [readingError, setReadingError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChannelIdeaRow | null>(null);
  const [draft, setDraft] = useState<IdeaDraft>({ title: "", angle: "", objective: "" });
  const [scriptAiProvider, setScriptAiProvider] = useState<"" | "anthropic" | "openai" | "gemini">("");
  const [scriptSceneCount, setScriptSceneCount] = useState(scriptDefaults.sceneCount);
  const [scriptWordsPerScene, setScriptWordsPerScene] = useState(Math.max(Math.ceil(100 / scriptDefaults.sceneCount), Math.round(scriptDefaults.wordCount / scriptDefaults.sceneCount)));
  const [showScriptContext, setShowScriptContext] = useState(false);

  useEffect(() => setRows(initialRows), [initialRows]);
  useEffect(() => {
    if (!showScriptContext) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setShowScriptContext(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showScriptContext]);

  const counts = useMemo(() => ({
    all: rows.length,
    video: rows.filter((row) => row.format === "video" || row.format === "both").length,
    short: rows.filter((row) => row.format === "short" || row.format === "both").length,
  }), [rows]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return rows.filter((row) => {
      const formatMatches = filter === "all" || row.format === filter || row.format === "both";
      const searchMatches = !normalized || `${row.title} ${row.angle} ${row.objective}`.toLocaleLowerCase("pt-BR").includes(normalized);
      return formatMatches && searchMatches;
    });
  }, [filter, query, rows]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selectable = pageRows.filter((row) => row.project === null && !busy);
  const allSelected = selectable.length > 0 && selectable.every((row) => selected.has(row.id));

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelected((current) => {
      const next = new Set(current);
      if (allSelected) selectable.forEach((row) => next.delete(row.id));
      else selectable.forEach((row) => next.add(row.id));
      return next;
    });
  }

  async function generateSelected() {
    const chosen = rows.filter((row) => selected.has(row.id) && row.project === null);
    const targetWords = scriptWordsPerScene * scriptSceneCount;
    if (chosen.length === 0 || !scriptAiProvider || targetWords < 100 || targetWords > 6000) return;
    setBusy(true);
    setError(null);
    try {
      const groups = new Map<string, ChannelIdeaRow[]>();
      for (const row of chosen) groups.set(row.planId, [...(groups.get(row.planId) ?? []), row]);
      for (const [planId, planRows] of groups) {
        const response = await fetch(`/api/channel/${channelId}/scripts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId,
            ideaIds: planRows.map((row) => row.id),
            aiProviderOverride: scriptAiProvider,
            sceneCount: scriptSceneCount,
            targetWords,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? `Falha ao gerar roteiros (HTTP ${response.status})`);
      }
      setSelected(new Set());
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteIdea(row: ChannelIdeaRow) {
    if (!window.confirm(`Remover o assunto “${row.title}” da listagem?`)) return;
    setError(null);
    try {
      const response = await fetch(`/api/channel/${channelId}/ideas/${row.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Não foi possível remover o assunto.");
      setRows((current) => current.filter((item) => item.id !== row.id));
      setSelected((current) => { const next = new Set(current); next.delete(row.id); return next; });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function saveIdea() {
    if (!editing || !draft.title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/channel/${channelId}/ideas/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar o assunto.");
      setRows((current) => current.map((row) => row.id === editing.id ? { ...row, ...draft } : row));
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function readScript(row: ChannelIdeaRow) {
    if (!row.project?.scriptId) return;
    setReadingBusy(true);
    setReadingError(null);
    try {
      const response = await fetch(`/api/videos/${row.project.id}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o roteiro.");
      const script = data.script as { rawText?: string; lines?: Array<{ text?: string }> } | null;
      const text = script?.rawText?.trim() || script?.lines?.map((line) => line.text?.trim()).filter(Boolean).join("\n\n");
      if (!text) throw new Error("O projeto está marcado com roteiro, mas o conteúdo salvo não foi encontrado.");
      setReading({ title: row.title, text });
    } catch (cause) {
      setReadingError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setReadingBusy(false);
    }
  }

  return (
    <section className="channel-view-ideas" aria-labelledby="channel-view-ideas-title">
      <header className="channel-view-ideas-heading">
        <div className="channel-view-ideas-title-copy">
          <h2 id="channel-view-ideas-title">Assuntos e roteiros</h2>
          <p>Assuntos gerados para este canal. Selecione os que deseja transformar em roteiro.</p>
        </div>
      </header>

      <div className="channel-view-ideas-toolbar">
        <div className="channel-view-ideas-list-panel">
        <div className="channel-view-idea-filters">
          <div className="channel-view-idea-formats" role="tablist" aria-label="Filtrar assuntos por formato">
            {([ ["video", "YouTube", "video"], ["short", "Shorts", "short"], ["all", "Todos", "all"] ] as const).map(([id, label, mark]) => (
              <button type="button" role="tab" aria-selected={filter === id} className={filter === id ? "selected" : ""} key={id} onClick={() => { setFilter(id); setPage(1); }}>
                {mark === "video" || mark === "short" ? <OutputMark format={mark} /> : <span className="channel-view-ideas-all-mark">▤</span>}
                {label}<small>{counts[id]}</small>
              </button>
            ))}
          </div>
          <div className="channel-view-ideas-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
            <input aria-label="Buscar assuntos pelo nome" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
            {query && <button type="button" aria-label="Limpar busca" title="Limpar busca" onClick={() => { setQuery(""); setPage(1); }}>×</button>}
          </div>
        </div>

      {error && <p className="channel-view-ideas-error" role="alert">{error}</p>}
      {filtered.length ? (
        <div className="channel-view-ideas-table-wrap">
          <table className="channel-view-ideas-table">
            <thead><tr>
              <th className="select-cell"><input type="checkbox" aria-label="Selecionar assuntos desta página" checked={allSelected} onChange={togglePage} disabled={selectable.length === 0} /></th>
              <th>#</th><th>Assunto</th><th>Roteiro</th><th>Status</th><th>Atualizado</th><th>Ações</th>
            </tr></thead>
            <tbody>{pageRows.map((row, index) => {
              const status = statusInfo(row);
              const canSelect = row.project === null;
              return <tr key={row.id}>
                <td className="select-cell"><input type="checkbox" aria-label={`Selecionar ${row.title}`} checked={selected.has(row.id)} disabled={!canSelect || busy} onChange={() => toggleSelected(row.id)} /></td>
                <td className="idea-index">{String((safePage - 1) * PAGE_SIZE + index + 1).padStart(2, "0")}</td>
                <td className="idea-title-cell">
                  <strong>{row.title}</strong>
                  <small>{formatLabel(row.format)} · {row.durationMinutes} min</small>
                  <span className="idea-costs-inline">
                    <span title="Custo estimado para gerar os assuntos deste lote, rateado entre os títulos."><b>CT</b>{row.titleCostUsd == null ? "—" : formatUsd(row.titleCostUsd)}</span>
                    <span title="Custo registrado para gerar o roteiro deste assunto."><b>CR</b>{row.scriptCostUsd == null ? "—" : formatUsd(row.scriptCostUsd)}</span>
                  </span>
                </td>
                <td className="idea-script-cell-cell"><div className="idea-script-cell">
                  {row.project?.scriptId ? (
                    <button className="channel-view-idea-status-icon ready clickable" type="button" aria-label={`Ler roteiro: ${row.title}`} title="Ler roteiro" onClick={() => void readScript(row)} disabled={readingBusy}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.75 3.25h7.1l4.4 4.4v13.1H6.75z" /><path d="M13.75 3.6v4.5h4.35M9.5 12h6m-6 3.5h6m-6 3.5h4" /></svg>
                    </button>
                  ) : (
                    <span className={`channel-view-idea-status-icon ${status.kind}`} role="img" aria-label={status.detail} title={status.detail}>
                      {status.kind === "working" ? <svg className="idea-status-spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /></svg>
                        : status.kind === "failed" ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v5m0 3h.01" /></svg>
                          : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10M7 21h10M8 4c0 4 1.4 5.4 4 8-2.6 2.6-4 4-4 8m8-16c0 4-1.4 5.4-4 8 2.6 2.6 4 4 4 8" /></svg>}
                    </span>
                  )}
                </div></td>
                <td><span className={`channel-view-idea-status ${status.kind}`}><i />{status.label}</span></td>
                <td className="idea-updated-cell"><time dateTime={row.project?.updatedAt} title={dateLabel(row.project?.updatedAt)}>{relativeDateLabel(row.project?.updatedAt)}</time></td>
                <td><div className="channel-view-idea-actions">
                  <button type="button" aria-label={`Visualizar ${row.title}`} title="Visualizar assunto" onClick={() => setPreview(row)}><Icon name="eye" /></button>
                  <button type="button" aria-label={`Editar ${row.title}`} title="Editar assunto" onClick={() => { setEditing(row); setDraft({ title: row.title, angle: row.angle, objective: row.objective }); }}><Icon name="edit" /></button>
                  <button type="button" aria-label={`Remover ${row.title}`} title="Remover assunto" onClick={() => void deleteIdea(row)}><Icon name="trash" /></button>
                </div></td>
              </tr>;
            })}</tbody>
          </table>
          <footer className="channel-view-ideas-footer">
            <strong>{selected.size} assuntos selecionados</strong>
            <span>Mostrando {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length}</span>
            <div className="channel-view-ideas-pagination">
              <button type="button" aria-label="Página anterior" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><Icon name="previous" /></button>
              <span>{safePage} / {pageCount}</span>
              <button type="button" aria-label="Próxima página" disabled={safePage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}><Icon name="next" /></button>
            </div>
          </footer>
        </div>
      ) : (
        <p className="channel-view-empty">{rows.length ? "Nenhum assunto corresponde à busca ou ao formato selecionado." : "Ainda não há assuntos neste canal. Gere assuntos para começar."}</p>
      )}
        </div>

        <aside className="channel-view-script-settings-card" aria-label="Configurações para gerar roteiros">
          <div className="channel-view-script-settings-card-heading">
            <div><h3>Gerar roteiros</h3><p>{selected.size ? `${selected.size} assunto${selected.size === 1 ? " selecionado" : "s selecionados"}` : "Selecione assuntos na tabela"}</p></div>
            <button type="button" className="channel-view-script-context-button" onClick={() => setShowScriptContext(true)} title="Ver contexto usado pela IA" aria-label="Ver contexto usado pela IA">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 4.5v17M8 7h8m-8 4h8m-8 4h5" /></svg>
            </button>
          </div>
          <div className="channel-view-script-settings-controls">
            <label className="channel-view-script-setting-field provider"><span>IA para os roteiros</span><select value={scriptAiProvider} onChange={(event) => setScriptAiProvider(event.target.value as typeof scriptAiProvider)}><option value="" disabled>Selecione uma IA</option><option value="anthropic">Claude (Anthropic)</option><option value="openai">ChatGPT (OpenAI)</option><option value="gemini">Gemini (Google)</option></select></label>
            <label className="channel-view-script-setting-field scenes"><span>Cenas por roteiro</span><select value={scriptSceneCount} onChange={(event) => {
              const nextCount = Number(event.target.value);
              setScriptSceneCount(nextCount);
              setScriptWordsPerScene((current) => Math.min(Math.floor(6000 / nextCount), Math.max(Math.ceil(100 / nextCount), current)));
            }}>{SCENE_COUNTS.map((count) => <option key={count} value={count}>{count}{count === scriptDefaults.sceneCount ? " · padrão" : " cenas"}</option>)}</select></label>
            <label className="channel-view-script-setting-field words"><span>Palavras por cena</span><input type="number" min={Math.ceil(100 / scriptSceneCount)} max={Math.floor(6000 / scriptSceneCount)} step={1} value={scriptWordsPerScene || ""} onChange={(event) => setScriptWordsPerScene(event.target.value === "" ? 0 : Number(event.target.value))} aria-describedby="channel-view-script-word-default" /></label>
            <small id="channel-view-script-word-default" className="channel-view-script-settings-card-note">Padrão do canal: {scriptDefaults.sceneCount} cenas · {scriptDefaults.wordCount.toLocaleString("pt-BR")} palavras no total</small>
            <button className="channel-view-ideas-generate" type="button" disabled={busy || selected.size === 0 || !scriptAiProvider || scriptWordsPerScene * scriptSceneCount < 100 || scriptWordsPerScene * scriptSceneCount > 6000} onClick={() => void generateSelected()}><span aria-hidden="true">＋</span> {busy ? "Gerando…" : `Gerar roteiros (${selected.size})`}</button>
          </div>
        </aside>
      </div>

      {(preview || editing || reading || readingBusy || readingError) && <div className="channel-view-context-preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setPreview(null); setEditing(null); setReading(null); setReadingError(null); } }}>
        <section className="channel-view-context-preview-dialog channel-view-idea-dialog" role="dialog" aria-modal="true" aria-labelledby="channel-view-idea-dialog-title">
          <div className="channel-view-context-preview-heading"><h4 id="channel-view-idea-dialog-title">{editing ? "Editar assunto" : reading ? `Roteiro — ${reading.title}` : readingBusy ? "Carregando roteiro…" : readingError ? "Roteiro indisponível" : preview?.title}</h4><button type="button" aria-label="Fechar" onClick={() => { setPreview(null); setEditing(null); setReading(null); setReadingError(null); }}>×</button></div>
          {readingBusy ? <p className="channel-view-idea-reading-state">Carregando conteúdo salvo…</p>
            : readingError ? <p className="channel-view-idea-reading-state error" role="alert">{readingError}</p>
            : reading ? <article className="channel-view-idea-script-content">{reading.text}</article>
            : editing ? <div className="channel-view-idea-edit-form">
            <label>Título<input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={220} /></label>
            <label>Ângulo<textarea value={draft.angle} onChange={(event) => setDraft((current) => ({ ...current, angle: event.target.value }))} rows={3} /></label>
            <label>Objetivo<textarea value={draft.objective} onChange={(event) => setDraft((current) => ({ ...current, objective: event.target.value }))} rows={3} /></label>
            <div className="channel-view-idea-edit-actions"><button type="button" onClick={() => setEditing(null)}>Cancelar</button><button type="button" disabled={busy || !draft.title.trim()} onClick={() => void saveIdea()}>{busy ? "Salvando…" : "Salvar alterações"}</button></div>
          </div> : preview && <div className="channel-view-idea-preview-content"><p><strong>Descrição</strong>{preview.angle}</p><p><strong>Objetivo</strong>{preview.objective}</p><p><strong>Formato</strong>{formatLabel(preview.format)} · {preview.durationMinutes} minutos</p></div>}
        </section>
      </div>}

      {showScriptContext && <div className="channel-view-context-preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowScriptContext(false); }}>
        <section className="channel-view-script-context-dialog" role="dialog" aria-modal="true" aria-labelledby="channel-view-script-context-title">
          <header className="channel-view-script-context-heading">
            <span className="channel-view-script-context-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 4.5v17M8 7h8m-8 4h8m-8 4h5" /></svg></span>
            <div><h3 id="channel-view-script-context-title">Contexto usado nos roteiros</h3><p>Estas informações são enviadas à IA junto com cada assunto selecionado.</p></div>
            <button type="button" aria-label="Fechar contexto" onClick={() => setShowScriptContext(false)}>×</button>
          </header>
          <div className="channel-view-script-context-content">
            {scriptContext.map((section) => <section className="channel-view-script-context-section" key={section.title}>
              <h4>{section.title}</h4>
              <div className="channel-view-script-context-items">
                {section.items.map((item) => <article className={`channel-view-script-context-item${item.label === "Prompt estrutural" ? " prompt" : ""}`} key={item.label}>
                  <h5>{item.label}</h5><p>{item.value}</p>
                </article>)}
              </div>
            </section>)}
          </div>
          <footer className="channel-view-script-context-footer"><span>As configurações do lote ficam no painel ao lado da tabela.</span><button type="button" onClick={() => setShowScriptContext(false)}>Entendi</button></footer>
        </section>
      </div>}
    </section>
  );
}
