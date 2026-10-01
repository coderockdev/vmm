"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Channel, VideoProject, VideoConcept } from "../../../core/types";
import {
  CoverFormat,
  normalizeCoverDna,
} from "../../../core/providers/image/coverFormats";
import { ImageProviderName } from "../../../core/providers/image/ImageProvider";
import { mediaUrl } from "../../../core/media";

type FormatChoice = string | "auto" | "invent";

type ProviderOption = {
  id: ImageProviderName;
  label: string;
  free: boolean;
  available: boolean;
  reason?: string;
  hint?: string;
};

const FALLBACK_PROVIDERS: ProviderOption[] = [
  { id: "pollinations", label: "Pollinations Flux", free: true, available: true, hint: "Melhor qualidade grátis" },
  { id: "pollinations-turbo", label: "Pollinations Turbo", free: true, available: true, hint: "Mais rápido" },
  { id: "pollinations-gptimage", label: "Pollinations GPT-Image", free: true, available: true, hint: "Texto na imagem" },
  { id: "openai", label: "OpenAI Images", free: false, available: true, hint: "Mais completo com chave" },
  { id: "gemini", label: "Gemini / Imagen", free: false, available: true, hint: "16:9 nativo" },
];

type HistoryItem = {
  id: string;
  styleId: string;
  styleLabel: string;
  url: string;
  createdAt: string;
};

function historyFromConcept(
  channelId: string,
  concept: VideoConcept | null | undefined
): HistoryItem[] {
  const source =
    concept?.history?.length
      ? concept.history
      : concept?.candidates ?? [];
  return [...source]
    .slice()
    .reverse()
    .map((c) => ({
      id: c.id,
      styleId: c.styleId,
      styleLabel: c.styleLabel,
      createdAt: c.createdAt,
      url: `${mediaUrl(channelId, c.ref) ?? ""}?t=1`,
    }))
    .filter((c) => c.url && !c.url.startsWith("null") && !c.url.startsWith("undefined"));
}

export function PortadasPanel({
  channel,
  projects,
  onProjectUpdated,
  focusProjectId,
}: {
  channel: Channel;
  projects: VideoProject[];
  onProjectUpdated: (project: VideoProject) => void;
  /** When opening from Roteiros/Áudio “Gerar portada”, pre-select that video. */
  focusProjectId?: string | null;
}) {
  const cover = useMemo(() => normalizeCoverDna(channel.dna.visual?.cover), [channel.dna.visual?.cover]);
  const formats = cover.formats.filter((f) => f.enabled !== false);

  // Portadas always belong to a video (roteiro/áudio). Prefer ones without cover first.
  const eligible = useMemo(() => {
    return projects
      .filter((p) => p.status !== "planned")
      .slice()
      .sort((a, b) => {
        const aHas = a.thumbnailRef ? 1 : 0;
        const bHas = b.thumbnailRef ? 1 : 0;
        if (aHas !== bHas) return aHas - bHas;
        return String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""));
      });
  }, [projects]);

  const [selectedId, setSelectedId] = useState(focusProjectId || eligible[0]?.id || "");
  const [videoQuery, setVideoQuery] = useState("");
  const selected = projects.find((p) => p.id === selectedId) ?? eligible[0] ?? null;

  const filteredVideos = useMemo(() => {
    const q = videoQuery.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.thumbnailConcept?.thumbnailText ?? "").toLowerCase().includes(q)
    );
  }, [eligible, videoQuery]);

  const [formatChoice, setFormatChoice] = useState<FormatChoice>("auto");
  const [title, setTitle] = useState("");
  const [thumbnailText, setThumbnailText] = useState("");
  const [thumbnailScene, setThumbnailScene] = useState("");
  const [imageProvider, setImageProvider] = useState<ImageProviderName>("openai");
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [concept, setConcept] = useState<VideoConcept | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [candidateUrls, setCandidateUrls] = useState<
    Array<{ id: string; styleId: string; styleLabel: string; url: string }>
  >([]);
  const [historyUrls, setHistoryUrls] = useState<HistoryItem[]>([]);
  const [imageCount, setImageCount] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState<"concept" | "image" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focusProjectId) return;
    if (projects.some((p) => p.id === focusProjectId && p.status !== "planned")) {
      setSelectedId(focusProjectId);
    }
  }, [focusProjectId, projects]);

  useEffect(() => {
    void fetch("/api/image-providers")
      .then((r) => r.json())
      .then((data) => {
        const opts = (data.options ?? []) as ProviderOption[];
        setProviderOptions(opts.length ? opts : FALLBACK_PROVIDERS);
        if (data.default) setImageProvider(data.default as ImageProviderName);
      })
      .catch(() => {
        setProviderOptions(FALLBACK_PROVIDERS);
      });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setTitle(selected.thumbnailConcept?.title || selected.headline || selected.title);
    setThumbnailText(selected.thumbnailConcept?.thumbnailText || "");
    setThumbnailScene(selected.thumbnailConcept?.thumbnailScene || "");
    setConcept(selected.thumbnailConcept);
    setThumbUrl(selected.thumbnailRef ? mediaUrl(channel.id, selected.thumbnailRef) : null);
    const fromConcept = (selected.thumbnailConcept?.candidates ?? []).map((c) => ({
      id: c.id,
      styleId: c.styleId,
      styleLabel: c.styleLabel,
      url: `${mediaUrl(channel.id, c.ref) ?? ""}?t=1`,
    }));
    setCandidateUrls(fromConcept.filter((c) => c.url && !c.url.startsWith("null") && !c.url.startsWith("undefined")));
    setHistoryUrls(historyFromConcept(channel.id, selected.thumbnailConcept));

    if (selected.thumbnailConcept?.thumbnailFormatId) {
      const id = String(selected.thumbnailConcept.thumbnailFormatId);
      if (id !== "auto" && id !== "invent") setFormatChoice(id);
    }

    // Pull any older PNGs still in Storage back into this video's history.
    void (async () => {
      try {
        const res = await fetch(`/api/videos/${selected.id}/thumbnail/recover`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.recovered || !data.concept) return;
        setConcept(data.concept);
        setHistoryUrls(historyFromConcept(channel.id, data.concept));
        if (data.project) onProjectUpdated(data.project);
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, channel.id]);

  // Sync from server when the selected project's concept changes (after generate).
  useEffect(() => {
    if (!selected?.thumbnailConcept) return;
    const hist = historyFromConcept(channel.id, selected.thumbnailConcept);
    if (hist.length === 0) return;
    setHistoryUrls((prev) => {
      const byId = new Map(prev.map((h) => [h.id, h]));
      for (const item of hist) byId.set(item.id, item);
      return Array.from(byId.values()).sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt))
      );
    });
    setConcept(selected.thumbnailConcept);
    if (selected.thumbnailRef) {
      setThumbUrl(mediaUrl(channel.id, selected.thumbnailRef));
    }
    const fromConcept = (selected.thumbnailConcept.candidates ?? []).map((c) => ({
      id: c.id,
      styleId: c.styleId,
      styleLabel: c.styleLabel,
      url: `${mediaUrl(channel.id, c.ref) ?? ""}?t=1`,
    }));
    const nextCandidates = fromConcept.filter(
      (c) => c.url && !c.url.startsWith("null") && !c.url.startsWith("undefined")
    );
    if (nextCandidates.length) setCandidateUrls(nextCandidates);
  }, [selected?.thumbnailConcept, selected?.thumbnailRef, channel.id]);

  async function runConcept(choice: FormatChoice, forceDifferentFormat = false) {
    if (!selected) return null;
    setBusy("concept");
    setError(null);
    try {
      const res = await fetch(`/api/videos/${selected.id}/thumbnail/concept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formatChoice: choice,
          titleHint: title || selected.headline || selected.title,
          forceDifferentFormat,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Falha no conceito (HTTP ${res.status})`);
      setConcept(data.concept);
      setTitle(data.concept.title || title);
      setThumbnailText(data.concept.thumbnailText || "");
      setThumbnailScene(data.concept.thumbnailScene || "");
      if (data.project) onProjectUpdated(data.project);
      return data.concept as VideoConcept;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function runGenerate(existingConcept?: VideoConcept | null) {
    if (!selected) return;
    setError(null);

    let workingConcept = existingConcept ?? concept;
    // Auto: think titles/text/scene from script + DNA if the user left fields empty.
    if (!workingConcept && !thumbnailScene.trim() && !thumbnailText.trim()) {
      workingConcept = await runConcept(formatChoice);
      if (!workingConcept) return;
    }

    setBusy("image");
    try {
      const nextTitle = workingConcept?.title || title || selected.headline || selected.title;
      const nextText = workingConcept?.thumbnailText || thumbnailText;
      const nextScene = workingConcept?.thumbnailScene || thumbnailScene;
      const fallbackConcept = {
        title: nextTitle,
        thumbnailFormatId: formatChoice,
        thumbnailFormatName:
          formats.find((f) => f.id === formatChoice)?.name || "manual",
        thumbnailText: nextText,
        thumbnailScene: nextScene,
        thumbnailEmotion: workingConcept?.thumbnailEmotion || "",
        thumbnailMessage: nextText,
        curiosityGap: workingConcept?.curiosityGap || "",
        titleThumbnailRelation: workingConcept?.titleThumbnailRelation || "",
        status: "ready" as const,
        history: selected.thumbnailConcept?.history ?? workingConcept?.history ?? null,
      };
      const res = await fetch(`/api/videos/${selected.id}/thumbnail/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageProvider,
          count: imageCount,
          title: nextTitle,
          thumbnailText: nextText,
          thumbnailScene: nextScene,
          concept: workingConcept
            ? {
                ...workingConcept,
                title: nextTitle,
                thumbnailText: nextText,
                thumbnailScene: nextScene,
                history: workingConcept.history ?? selected.thumbnailConcept?.history ?? null,
              }
            : fallbackConcept,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Falha na imagem (HTTP ${res.status})`);
      setConcept(data.concept);
      setTitle(data.concept?.title || nextTitle);
      setThumbnailText(data.concept?.thumbnailText || nextText);
      setThumbnailScene(data.concept?.thumbnailScene || nextScene);
      setThumbUrl(data.thumbnailUrl);
      setCandidateUrls(data.candidates ?? []);

      const urlById = new Map(
        ((data.candidates ?? []) as Array<{ id: string; url: string }>).map((c) => [c.id, c.url])
      );
      const fromServer = historyFromConcept(channel.id, data.concept).map((h) => ({
        ...h,
        url: urlById.get(h.id) ?? h.url.replace(/\?t=1$/, `?t=${Date.now()}`),
      }));
      setHistoryUrls((prev) => {
        const byId = new Map(prev.map((h) => [h.id, h]));
        for (const item of fromServer) byId.set(item.id, item);
        return Array.from(byId.values()).sort((a, b) =>
          String(b.createdAt).localeCompare(String(a.createdAt))
        );
      });

      if (data.partialError) setError(`Algumas falharam: ${data.partialError}`);
      if (data.project) onProjectUpdated(data.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function runAuto() {
    if (!selected) return;
    setError(null);
    const made = await runConcept(formatChoice);
    if (!made) return;
    await runGenerate(made);
  }

  async function selectCandidate(candidateId: string) {
    if (!selected) return;
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(`/api/videos/${selected.id}/thumbnail/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha ao escolher a portada");
      setConcept(data.concept);
      setThumbUrl(data.thumbnailUrl);
      if (data.concept?.candidates) {
        setCandidateUrls(
          data.concept.candidates.map((c: { id: string; styleId: string; styleLabel: string; ref: string }) => ({
            id: c.id,
            styleId: c.styleId,
            styleLabel: c.styleLabel,
            url: `${mediaUrl(channel.id, c.ref)}?t=${Date.now()}`,
          }))
        );
      }
      if (data.project) onProjectUpdated(data.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveInventedFormat() {
    if (!concept?.inventedFormat) return;
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channel.id}/cover-formats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventedFormat: concept.inventedFormat }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar formato");
      setError(null);
      alert(`Formato salvo: ${data.format?.name ?? "ok"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function pickVideo(id: string) {
    setHistoryUrls([]);
    setCandidateUrls([]);
    setSelectedId(id);
  }

  if (eligible.length === 0) {
    return (
      <section className="costs-section">
        <div className="workspace-section-title">
          <h2>Portadas</h2>
          <p>Gere o roteiro primeiro — a portada dialoga com o título do vídeo.</p>
        </div>
        <div className="review-empty-state">
          Nenhum projeto ainda. Crie ideias e gere roteiros para abrir o motor de miniaturas.
        </div>
      </section>
    );
  }

  return (
    <section className="costs-section portadas-section">
      <div className="costs-heading">
        <div className="workspace-section-title">
          <h2>Portadas (Thumbnail Creative Engine)</h2>
          <p>
            Cada portada pertence a um vídeo. Escolhe o vídeo abaixo, gera imagens — o histórico
            desse vídeo acumula e não apaga gerações anteriores.
          </p>
        </div>
      </div>

      <div className="portadas-video-picker">
        <div className="portadas-video-picker-bar">
          <label className="portadas-label portadas-video-search">
            Vídeo
            <input
              type="search"
              value={videoQuery}
              onChange={(e) => setVideoQuery(e.target.value)}
              placeholder="Pesquisar por título…"
              aria-label="Pesquisar vídeo"
            />
          </label>
          <span className="portadas-video-count">
            {filteredVideos.length} de {eligible.length}
            {selected ? ` · a trabalhar: ${selected.title}` : ""}
          </span>
        </div>
        <div className="portadas-video-rail" role="listbox" aria-label="Vídeos do canal">
          {filteredVideos.length === 0 ? (
            <p className="portadas-actions-hint">Nenhum vídeo com esse nome.</p>
          ) : (
            filteredVideos.map((p) => {
              const active = p.id === selected?.id;
              const thumb = p.thumbnailRef ? mediaUrl(channel.id, p.thumbnailRef) : null;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`portadas-video-chip${active ? " active" : ""}${p.thumbnailRef ? " has-thumb" : ""}`}
                  onClick={() => pickVideo(p.id)}
                  title={p.title}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${thumb}?t=1`} alt="" />
                  ) : (
                    <span className="portadas-video-chip-empty">sem capa</span>
                  )}
                  <span className="portadas-video-chip-title">{p.title}</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {error && <div className="generation-error">{error}</div>}

      <div className="portadas-layout">
        <div className="costs-block">
          <label className="portadas-label">
            Título
            <textarea value={title} onChange={(e) => setTitle(e.target.value)} rows={2} />
            <span className="portadas-actions-hint">Pode deixar o título do roteiro — a IA pode reescrever no automático.</span>
          </label>

          <label className="portadas-label">
            Formato de portada
            <select
              value={formatChoice}
              onChange={(e) => setFormatChoice(e.target.value as FormatChoice)}
            >
              <option value="auto">Automático</option>
              {formats.map((f: CoverFormat, i) => (
                <option key={f.id} value={f.id}>
                  {String(i + 1).padStart(2, "0")} — {f.name}
                </option>
              ))}
              <option value="invent">✨ Generar nuevo formato</option>
            </select>
          </label>

          <div className="portadas-format-hint">
            {formatChoice === "auto" && (
              <p>A IA escolhe o formato pela história (não aleatório) e evita repetir os últimos.</p>
            )}
            {formatChoice === "invent" && (
              <p>A IA inventa uma composição nova e pode salvar na biblioteca do canal.</p>
            )}
            {formatChoice !== "auto" && formatChoice !== "invent" && (
              <p>{formats.find((f) => f.id === formatChoice)?.description}</p>
            )}
          </div>

          <label className="portadas-label">
            Texto de portada <em style={{ fontWeight: 500, color: "#6b7280" }}>(opcional)</em>
            <input
              value={thumbnailText}
              onChange={(e) => setThumbnailText(e.target.value)}
              placeholder="Vazio = a IA inventa a partir do roteiro + DNA"
            />
          </label>

          <label className="portadas-label">
            Conceito visual <em style={{ fontWeight: 500, color: "#6b7280" }}>(opcional)</em>
            <textarea
              value={thumbnailScene}
              onChange={(e) => setThumbnailScene(e.target.value)}
              rows={3}
              placeholder="Vazio = a IA descreve a cena a partir do roteiro"
            />
          </label>

          <label className="portadas-label">
            Gerador de imagem
            <select
              value={imageProvider}
              onChange={(e) => setImageProvider(e.target.value as ImageProviderName)}
            >
              <optgroup label="Grátis (sem chave)">
                {(providerOptions.length ? providerOptions : FALLBACK_PROVIDERS)
                  .filter((opt) => opt.free)
                  .map((opt) => (
                    <option key={opt.id} value={opt.id} disabled={!opt.available}>
                      {opt.label}
                      {opt.hint ? ` — ${opt.hint}` : " · grátis"}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Com chave (mais completo)">
                {(providerOptions.length ? providerOptions : FALLBACK_PROVIDERS)
                  .filter((opt) => !opt.free)
                  .map((opt) => (
                    <option key={opt.id} value={opt.id} disabled={!opt.available}>
                      {opt.label}
                      {opt.available && opt.hint ? ` — ${opt.hint}` : ""}
                      {!opt.available && opt.reason ? ` — ${opt.reason}` : ""}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>

          <label className="portadas-label">
            Quantas imagens (o automático sobe 1; 2 ou 3 são para comparar à mão)
            <div className="portadas-count-pills" role="group" aria-label="Quantidade de imagens">
              {([1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={imageCount === n ? "active" : ""}
                  disabled={!!busy}
                  onClick={() => setImageCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <span className="portadas-count-hint">
              {imageCount === 1
                ? "1 imagem — é esta que o YouTube recebe pela API"
                : imageCount === 2
                  ? "2 imagens para comparar aqui. O YouTube fica com a que marcares como principal."
                  : "3 imagens para comparar aqui. O YouTube fica com a que marcares como principal."}
            </span>
          </label>

          <div className="portadas-actions">
            <button
              type="button"
              className="portadas-generate-image"
              disabled={!!busy || !selected}
              onClick={() => void runAuto()}
            >
              {busy === "concept"
                ? "A pensar título + formato…"
                : busy === "image"
                  ? `Gerando ${imageCount} imagen${imageCount > 1 ? "s" : ""}…`
                  : `Gerar automático (${imageCount} imagen${imageCount > 1 ? "s" : ""})`}
            </button>
            <button type="button" disabled={!!busy} onClick={() => void runConcept(formatChoice)}>
              {busy === "concept" ? "Criando conceito…" : "Só conceito"}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void runGenerate()}
            >
              {busy === "image"
                ? `Gerando ${imageCount} imagen${imageCount > 1 ? "s" : ""}…`
                : `Só imagens (${imageCount})`}
            </button>
            <button
              type="button"
              disabled={!!busy || (!concept && !thumbnailScene.trim())}
              onClick={() => void runConcept(formatChoice, false).then((c) => c && runGenerate(c))}
            >
              Regenerar (mesmo formato)
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void runConcept("auto", true)}
            >
              Probar otro formato
            </button>
            <button type="button" disabled={!!busy} onClick={() => void runConcept("invent")}>
              Inventar formato
            </button>
            {concept?.inventedFormat && (
              <button type="button" disabled={!!busy} onClick={() => void saveInventedFormat()}>
                {busy === "save" ? "Salvando…" : "Guardar como nuevo formato"}
              </button>
            )}
          </div>
          <p className="portadas-actions-hint">
            <strong>Gerar automático</strong> usa o roteiro + DNA (títulos de sucesso, skill, formatos) —
            não precisas preencher texto/conceito. Depois podes editar e regenerar.
            Cada geração fica no histórico; clica numa para marcar como principal.
          </p>

          {concept?.titleThumbnailRelation && (
            <p className="portadas-relation">
              <strong>Relação título↔portada:</strong> {concept.titleThumbnailRelation}
            </p>
          )}
        </div>

        <div className="costs-block portadas-preview">
          <h3>
            Lote atual {candidateUrls.length > 1 ? `(${candidateUrls.length} variações)` : ""}
          </h3>
          {busy === "concept" ? (
            <div className="portadas-img-empty">A ler o roteiro e o DNA para inventar título + conceito…</div>
          ) : busy === "image" ? (
            <div className="portadas-img-empty">Gerando {imageCount} imagen{imageCount > 1 ? "s" : ""}…</div>
          ) : candidateUrls.length > 0 ? (
            <div className={`portadas-candidates portadas-candidates-${Math.min(3, candidateUrls.length)}`}>
              {candidateUrls.map((c, i) => {
                const selectedCandidateId =
                  concept?.candidates?.[concept.selectedCandidateIndex ?? 0]?.id ??
                  candidateUrls[0]?.id;
                const isSelected = c.id === selectedCandidateId || (selectedCandidateId == null && i === 0);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`portadas-candidate${isSelected ? " active" : ""}`}
                    onClick={() => void selectCandidate(c.id)}
                    disabled={!!busy}
                    title="Definir como portada principal"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.url} alt={c.styleLabel} />
                    <span>
                      {c.styleLabel}
                      {isSelected ? " · principal" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt="Portada gerada" className="portadas-img" />
          ) : (
            <div className="portadas-img-empty">
              Sem imagem ainda — clica em <strong>Gerar automático</strong> (usa o roteiro + DNA)
            </div>
          )}
          {candidateUrls.length > 0 && (
            <p className="portadas-actions-hint">
              Abre cada imagem num separador para descarregar e subir as 3 no YouTube.
              {" "}
              {candidateUrls.map((c, i) => (
                <a key={c.id} href={c.url} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>
                  #{i + 1} {c.styleLabel}
                </a>
              ))}
            </p>
          )}

          {historyUrls.length > 0 && (
            <div className="portadas-history">
              <h3>Histórico deste vídeo ({historyUrls.length})</h3>
              <p className="portadas-actions-hint">
                Todas as gerações deste vídeo — gera de novo sem apagar as anteriores.
              </p>
              <div className="portadas-history-strip">
                {historyUrls.map((c) => {
                  const isPrimary =
                    thumbUrl?.split("?")[0] === c.url.split("?")[0] ||
                    concept?.candidates?.[concept.selectedCandidateIndex ?? 0]?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`portadas-history-item${isPrimary ? " active" : ""}`}
                      onClick={() => void selectCandidate(c.id)}
                      disabled={!!busy}
                      title={`${c.styleLabel} · tornar principal`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.url} alt={c.styleLabel} />
                      <span>{c.styleLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="portadas-format-grid">
            {formats.slice(0, 10).map((f, i) => (
              <button
                key={f.id}
                type="button"
                className={formatChoice === f.id ? "active" : ""}
                onClick={() => setFormatChoice(f.id)}
                title={f.description}
              >
                <strong>
                  {String(i + 1).padStart(2, "0")} · {f.previewHint}
                </strong>
                <span>{f.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
