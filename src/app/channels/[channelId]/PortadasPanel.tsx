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

  const eligible = projects.filter((p) => p.status !== "planned");
  const [selectedId, setSelectedId] = useState(focusProjectId || eligible[0]?.id || "");
  const selected = projects.find((p) => p.id === selectedId) ?? eligible[0] ?? null;

  const [formatChoice, setFormatChoice] = useState<FormatChoice>("auto");
  const [title, setTitle] = useState("");
  const [thumbnailText, setThumbnailText] = useState("");
  const [thumbnailScene, setThumbnailScene] = useState("");
  const [imageProvider, setImageProvider] = useState<ImageProviderName>("pollinations");
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [concept, setConcept] = useState<VideoConcept | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
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
    setTitle(selected.thumbnailConcept?.title || selected.title);
    setThumbnailText(selected.thumbnailConcept?.thumbnailText || "");
    setThumbnailScene(selected.thumbnailConcept?.thumbnailScene || "");
    setConcept(selected.thumbnailConcept);
    setThumbUrl(selected.thumbnailRef ? mediaUrl(channel.id, selected.thumbnailRef) : null);
    if (selected.thumbnailConcept?.thumbnailFormatId) {
      const id = String(selected.thumbnailConcept.thumbnailFormatId);
      if (id !== "auto" && id !== "invent") setFormatChoice(id);
    }
  }, [selected?.id, selected?.thumbnailConcept, selected?.thumbnailRef, channel.id]);

  async function runConcept(choice: FormatChoice, forceDifferentFormat = false) {
    if (!selected) return;
    setBusy("concept");
    setError(null);
    try {
      const res = await fetch(`/api/videos/${selected.id}/thumbnail/concept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formatChoice: choice,
          titleHint: title,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function runGenerate() {
    if (!selected) return;
    setBusy("image");
    setError(null);
    try {
      const res = await fetch(`/api/videos/${selected.id}/thumbnail/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageProvider,
          title,
          thumbnailText,
          thumbnailScene,
          concept: concept
            ? { ...concept, title, thumbnailText, thumbnailScene }
            : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Falha na imagem (HTTP ${res.status})`);
      setConcept(data.concept);
      setThumbUrl(data.thumbnailUrl);
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
          <p>Título + portada como uma unidade. Formatos Amor Amor · Automático · Inventar.</p>
        </div>
        <select
          className="ideas-ai-select"
          value={selected?.id ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          aria-label="Projeto"
        >
          {eligible.map((p) => (
            <option key={p.id} value={p.id}>
              {p.thumbnailRef ? "[capa] " : ""}
              {p.title}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="generation-error">{error}</div>}

      <div className="portadas-layout">
        <div className="costs-block">
          <label className="portadas-label">
            Título
            <textarea value={title} onChange={(e) => setTitle(e.target.value)} rows={2} />
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
            Texto de portada
            <input value={thumbnailText} onChange={(e) => setThumbnailText(e.target.value)} />
          </label>

          <label className="portadas-label">
            Conceito visual
            <textarea value={thumbnailScene} onChange={(e) => setThumbnailScene(e.target.value)} rows={3} />
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

          <div className="portadas-actions">
            <button type="button" disabled={!!busy} onClick={() => void runConcept(formatChoice)}>
              {busy === "concept" ? "Criando conceito…" : "1. Gerar conceito título+portada"}
            </button>
            <button type="button" disabled={!!busy || !concept} onClick={() => void runGenerate()}>
              {busy === "image" ? "Gerando imagem…" : "2. Gerar portada"}
            </button>
            <button
              type="button"
              disabled={!!busy || !concept}
              onClick={() => void runConcept(formatChoice, false).then(() => runGenerate())}
            >
              Regenerar mesmo formato
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void runConcept("auto", true)}
            >
              Probar otro formato
            </button>
            <button type="button" disabled={!!busy} onClick={() => void runConcept("invent")}>
              ✨ Inventar formato
            </button>
            {concept?.inventedFormat && (
              <button type="button" disabled={!!busy} onClick={() => void saveInventedFormat()}>
                {busy === "save" ? "Salvando…" : "Guardar como nuevo formato"}
              </button>
            )}
          </div>

          {concept?.titleThumbnailRelation && (
            <p className="portadas-relation">
              <strong>Relação título↔portada:</strong> {concept.titleThumbnailRelation}
            </p>
          )}
        </div>

        <div className="costs-block portadas-preview">
          <h3>Preview</h3>
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt="Portada gerada" className="portadas-img" />
          ) : (
            <div className="portadas-img-empty">Sem imagem ainda</div>
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
