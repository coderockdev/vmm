"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { VideoProject } from "../../../core/types";
import type { ChannelIdeaRow } from "./ChannelIdeasTable";
import type { VideoConcept } from "../../../core/providers/image/coverFormats";
import type { ImageProviderName } from "../../../core/providers/image/ImageProvider";
import { normalizeCoverDna } from "../../../core/providers/image/coverFormats";
import { mediaUrl } from "../../../core/media";

type ProviderOption = { id: ImageProviderName; label: string; available: boolean; reason?: string };

function candidatesFor(project: VideoProject, channelId: string) {
  const candidates = project.thumbnailConcept?.history?.length
    ? project.thumbnailConcept.history
    : project.thumbnailConcept?.candidates ?? [];
  return [...candidates].reverse().map((candidate) => ({
    ...candidate,
    url: mediaUrl(channelId, candidate.ref),
  })).filter((candidate) => candidate.url);
}

function formatName(format: string) {
  return format === "short" ? "Shorts" : format === "both" ? "YouTube · Shorts" : "YouTube";
}

export function ChannelThumbnails({
  channelId,
  channelName,
  projects: initialProjects,
  ideas,
  coverFormats,
}: {
  channelId: string;
  channelName: string;
  projects: VideoProject[];
  ideas: ChannelIdeaRow[];
  coverFormats: ReturnType<typeof normalizeCoverDna>;
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(3);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [provider, setProvider] = useState<ImageProviderName | "">("");
  const [busy, setBusy] = useState<"generate" | "select" | null>(null);
  const [selectingCandidateId, setSelectingCandidateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scriptText, setScriptText] = useState("");
  const [showContext, setShowContext] = useState(false);

  useEffect(() => setProjects(initialProjects), [initialProjects]);
  useEffect(() => {
    void fetch("/api/image-providers").then(async (response) => {
      if (!response.ok) throw new Error("Não foi possível carregar os provedores de imagem.");
      return response.json();
    }).then((data) => {
      setProviders((data.options ?? []).filter((option: ProviderOption) => option.available));
      setProvider(data.default ?? "");
    }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);

  const eligible = useMemo(() => projects.filter((project) => project.scriptId && project.status !== "planned" && project.format !== "short")
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))), [projects]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return eligible.filter((project) => !normalized || project.title.toLocaleLowerCase("pt-BR").includes(normalized));
  }, [eligible, query]);
  const selected = eligible.find((project) => project.id === selectedId) ?? filtered[0] ?? eligible[0] ?? null;
  const selectedIdea = selected ? ideas.find((idea) => idea.id === selected.contentIdeaId) : null;
  const candidates = selected ? candidatesFor(selected, channelId) : [];

  useEffect(() => {
    if (!selected) { setPrompt(""); return; }
    setSelectedId(selected.id);
    setPrompt(selected.thumbnailConcept?.thumbnailScene ?? "");
    setSelectedCandidates(new Set());
    setScriptText("");
    void fetch(`/api/videos/${selected.id}`).then(async (response) => {
      if (!response.ok) throw new Error("Não foi possível carregar o roteiro selecionado.");
      return response.json();
    }).then((data) => setScriptText(typeof data.script?.rawText === "string" ? data.script.rawText : ""))
      .catch(() => setScriptText(""));
    let active = true;
    void fetch(`/api/videos/${selected.id}/thumbnail/recover`, { method: "POST" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((data) => { if (active && data?.recovered && data.project) updateProject(data.project); })
      .catch(() => {});
    return () => { active = false; };
  }, [selected?.id]);

  function updateProject(project: VideoProject) {
    setProjects((current) => current.map((item) => item.id === project.id ? project : item));
  }

  async function generate() {
    if (!selected || !provider) return;
    setBusy("generate"); setError(null);
    try {
      let concept: VideoConcept | null = selected.thumbnailConcept;
      if (!concept) {
        const conceptResponse = await fetch(`/api/channel/thumbnail/${selected.id}/concept`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formatChoice: "auto", titleHint: selected.title }),
        });
        const conceptData = await conceptResponse.json();
        if (!conceptResponse.ok) throw new Error(conceptData.error ?? "Não foi possível preparar o conceito.");
        concept = conceptData.concept;
        if (conceptData.project) updateProject(conceptData.project);
      }
      const response = await fetch(`/api/channel/thumbnail/${selected.id}/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageProvider: provider, count, title: selected.title,
          thumbnailText: concept?.thumbnailText ?? "", thumbnailScene: prompt,
          concept: { ...concept, title: selected.title, thumbnailScene: prompt },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao gerar thumbnails.");
      if (data.project) updateProject(data.project);
      if (data.partialError) setError(`Algumas variações não foram geradas: ${data.partialError}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(null); }
  }

  async function selectCandidate(candidateId: string) {
    if (!selected) return;
    setBusy("select"); setError(null);
    setSelectingCandidateId(candidateId);
    try {
      const response = await fetch(`/api/videos/${selected.id}/thumbnail/select`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível selecionar a thumbnail.");
      if (data.project) updateProject(data.project);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(null); setSelectingCandidateId(null); }
  }

  async function downloadSelected() {
    const toDownload = candidates.filter((candidate) => selectedCandidates.has(candidate.id));
    try {
      for (const [index, candidate] of toDownload.entries()) {
        const response = await fetch(candidate.url!);
        if (!response.ok) throw new Error("Falha ao baixar uma das imagens selecionadas.");
        const blob = await response.blob();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${selected?.title ?? "thumbnail"}-${index + 1}.png`;
        link.click(); URL.revokeObjectURL(link.href);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  return (
    <section className="channel-view-thumbnails-layout" aria-label="Thumbnails do canal">
      <aside className="channel-view-thumbnails-scripts">
        <h2>Roteiros</h2><p>Selecione um roteiro para gerar thumbnails.</p>
        <label className="channel-view-thumbnails-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar roteiros..." aria-label="Buscar roteiros" /></label>
        <div className="channel-view-thumbnails-script-list">
          {filtered.map((project, index) => {
            const idea = ideas.find((row) => row.id === project.contentIdeaId);
            return <button type="button" key={project.id} className={`channel-view-thumbnails-script${selected?.id === project.id ? " selected" : ""}`} onClick={() => setSelectedId(project.id)}>
              <span className="channel-view-thumbnails-check">{selected?.id === project.id ? "✓" : ""}</span><span className="channel-view-thumbnails-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="channel-view-thumbnails-script-copy"><strong>{project.title}</strong><small>{formatName(project.format)}</small><small><span title="Custo de criação do título">CT {idea?.titleCostUsd == null ? "—" : `$${idea.titleCostUsd.toFixed(4)}`}</span><span title="Custo de geração do roteiro">CR {idea?.scriptCostUsd == null ? "—" : `$${idea.scriptCostUsd.toFixed(4)}`}</span></small></span>
            </button>;
          })}
          {!filtered.length && <p className="channel-view-thumbnails-empty">{eligible.length ? "Nenhum roteiro corresponde à busca." : "Ainda não há roteiros prontos para gerar thumbnails."}</p>}
        </div>
      </aside>

      <section className="channel-view-thumbnails-results">
        <header><div><h2>Thumbnails geradas</h2><p>Selecione uma imagem para defini-la como principal ou visualize em tela cheia.</p></div><button type="button" disabled={!selectedCandidates.size} onClick={downloadSelected}>↓ <span>Baixar selecionadas</span></button></header>
        {selected ? <>
          <div className="channel-view-thumbnail-context">
            <div><small>CONTEXTO DO ROTEIRO</small><strong>{selected.topic || selected.title}</strong><p>{scriptText ? `${scriptText.slice(0, 260)}${scriptText.length > 260 ? "…" : ""}` : "O roteiro selecionado será usado como referência para a cena e os elementos visuais."}</p></div>
            <button type="button" onClick={() => setShowContext(true)}>Ver contexto aplicado</button>
          </div>
          <div className="channel-view-thumbnails-result-title"><strong>Roteiro · {selected.title}</strong><small>{candidates.length} {candidates.length === 1 ? "thumbnail" : "thumbnails"}</small></div>
          {candidates.length ? <div className="channel-view-thumbnails-grid">{candidates.map((candidate) => {
            const primary = selected.thumbnailConcept?.candidates?.[selected.thumbnailConcept?.selectedCandidateIndex ?? 0]?.id === candidate.id || selected.thumbnailRef === candidate.ref;
            return <article key={candidate.id} className="channel-view-thumbnail-card"><div className="channel-view-thumbnail-image"><img src={candidate.url!} alt={`Thumbnail de ${selected.title}`} /><label title="Selecionar para baixar"><input type="checkbox" checked={selectedCandidates.has(candidate.id)} onChange={(event) => setSelectedCandidates((current) => { const next = new Set(current); event.target.checked ? next.add(candidate.id) : next.delete(candidate.id); return next; })} /></label>{primary && <span className="channel-view-thumbnail-primary">Principal</span>}<span className="channel-view-thumbnail-ratio">16:9</span></div><div className="channel-view-thumbnail-actions"><button type="button" onClick={() => setPreviewUrl(candidate.url!)} aria-label="Visualizar thumbnail em tela cheia" title="Tela cheia"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/></svg></button><button type="button" onClick={() => void selectCandidate(candidate.id)} disabled={busy !== null || primary} aria-label="Definir como thumbnail principal" title={primary ? "Esta já é a thumbnail principal" : "Definir como thumbnail principal"}>{selectingCandidateId === candidate.id ? "Salvando..." : primary ? "Principal" : "Usar como principal"}</button></div></article>;
          })}</div> : <div className="channel-view-thumbnails-no-results">Nenhuma thumbnail foi gerada para este roteiro ainda.</div>}
        </> : <div className="channel-view-thumbnails-no-results">Selecione um roteiro com script pronto para ver as thumbnails.</div>}
      </section>

      <aside className="channel-view-thumbnails-settings">
        <h2>Configurações de geração</h2><p>Ajuste os parâmetros para criar novas thumbnails.</p>
        <label className="channel-view-thumbnails-field">Prompt visual<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={2000} placeholder="Descreva a cena e os elementos visuais desejados..." disabled={!selected} /></label>
        <label className="channel-view-thumbnails-field">Quantidade de variações<select value={count} onChange={(event) => setCount(Number(event.target.value))}><option value={1}>1 variação</option><option value={2}>2 variações</option><option value={3}>3 variações</option></select></label>
        <label className="channel-view-thumbnails-field">Modelo de imagem<select value={provider} onChange={(event) => setProvider(event.target.value as ImageProviderName)}><option value="">Selecione um modelo</option>{providers.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <button className="channel-view-thumbnails-generate" type="button" onClick={() => void generate()} disabled={!selected || !provider || busy !== null}>{busy === "generate" ? "Gerando..." : "✦  Gerar thumbnails"}</button>
        {error && <p className="channel-view-thumbnails-error" role="alert">{error}</p>}
        <p className="channel-view-thumbnails-note">As imagens são geradas com base no roteiro selecionado e salvas junto ao canal.</p>
      </aside>
      {previewUrl && <div className="channel-view-thumbnail-preview" role="dialog" aria-modal="true" aria-label="Pré-visualização da thumbnail" onClick={() => setPreviewUrl(null)}><button type="button" onClick={() => setPreviewUrl(null)} aria-label="Fechar pré-visualização">×</button><img src={previewUrl} alt="Thumbnail em tamanho ampliado" /></div>}
      {showContext && selected && <div className="channel-view-thumbnail-context-backdrop" role="presentation" onClick={() => setShowContext(false)}><section className="channel-view-thumbnail-context-dialog" role="dialog" aria-modal="true" aria-labelledby="channel-thumbnail-context-title" onClick={(event) => event.stopPropagation()}>
        <header><div><h3 id="channel-thumbnail-context-title">Contexto aplicado à thumbnail</h3><p>Estas informações orientam o conceito e a geração visual.</p></div><button type="button" onClick={() => setShowContext(false)} aria-label="Fechar">×</button></header>
        <div className="channel-view-thumbnail-context-body">
          <article><small>CANAL</small><strong>{channelName}</strong><p>{coverFormats.styleRules || "Sem regras visuais específicas configuradas."}</p>{coverFormats.avoid.length > 0 && <p><b>Evitar:</b> {coverFormats.avoid.join(", ")}</p>}</article>
          <article><small>ROTEIRO E TEMA</small><strong>{selected.title}</strong><p><b>Tópico:</b> {selected.topic || selected.title}</p><p className="script-excerpt">{(scriptText || selected.topic || "Texto do roteiro indisponível.").slice(0, 1800)}{(scriptText || selected.topic).length > 1800 ? "…" : ""}</p></article>
          <article><small>PAR: TÍTULO + TEXTO DA THUMBNAIL</small><strong>Título: {selected.title}</strong><p><b>Texto na imagem:</b> {selected.thumbnailConcept?.thumbnailText || "O conceito definirá uma frase curta complementar ao título."}</p><p><b>Relação:</b> {selected.thumbnailConcept?.titleThumbnailRelation || "A thumbnail deve acrescentar curiosidade e emoção sem repetir o título."}</p></article>
          <article><small>DIREÇÃO VISUAL</small><p>{prompt || selected.thumbnailConcept?.thumbnailScene || "A direção de cena será definida pelo conceito, com base no roteiro e no estilo do canal."}</p><p><b>Formato criativo:</b> {selected.thumbnailConcept?.thumbnailFormatName || "Será definido pelo prompt do canal"} · YouTube 16:9</p></article>
        </div>
      </section></div>}
    </section>
  );
}
