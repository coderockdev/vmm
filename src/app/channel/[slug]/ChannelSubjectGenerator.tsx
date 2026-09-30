"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { VideoFormat } from "../../../core/types";
import { useChannelSections } from "./ChannelSections";

const OUTPUT_FORMATS = [
  { id: "video", title: "YouTube" },
  { id: "short", title: "Shorts" },
] as const;

export function OutputMark({ format }: { format: "video" | "short" }) {
  if (format === "video") {
    return (
      <svg className="channel-output-mark youtube" viewBox="0 0 24 18" aria-hidden="true">
        <rect width="24" height="18" rx="5" fill="currentColor" />
        <path d="m10 5 6 4-6 4V5Z" fill="white" />
      </svg>
    );
  }

  return (
    <svg className="channel-output-mark shorts" viewBox="0 0 20 24" aria-hidden="true">
      <path d="M8.2 1.6c1.3-.8 3-.3 3.7.9.7 1.2.3 2.7-.8 3.4L9 7.1l3.1 1.8c1.5.9 3.1 1.9 4.6 2.8 2.2 1.3 2.8 4.2 1.4 6.4-1.4 2.1-4.1 2.7-6.2 1.3l-2.2-1.5v2.4c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5v-4.7l-2-1.3c-2.1-1.4-2.7-4.1-1.3-6.2 1.4-2.1 4.1-2.7 6.2-1.3l2.1 1.4V8.1L5 5.3c-1.2-.8-1.5-2.4-.7-3.6.8-1.2 2.4-1.5 3.6-.7l1.8 1.2-1.5-.6Z" fill="currentColor" />
      <path d="m9 11 5 3-5 3v-6Z" fill="white" />
    </svg>
  );
}

function PreviewIconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="channel-view-context-preview-button" type="button" aria-label={`Pré-visualizar ${label}`} title={`Pré-visualizar ${label}`} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.7" /></svg>
    </button>
  );
}

export function ChannelSubjectGenerator({
  channelId,
  durationMinutes,
  exampleTopic,
  channelContext,
  channelPrompt,
  successfulTitles,
}: {
  channelId: string;
  durationMinutes: number;
  exampleTopic: string;
  channelContext: Array<{ label: string; value: string }>;
  channelPrompt: string;
  successfulTitles: string[];
}) {
  const router = useRouter();
  const { openSection } = useChannelSections();
  const [topic, setTopic] = useState("");
  const [selectedFormats, setSelectedFormats] = useState<Array<"video" | "short">>(["video", "short"]);
  const [quantity, setQuantity] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState<number | null>(null);
  const [useSuccessfulTitles, setUseSuccessfulTitles] = useState(successfulTitles.length > 0);
  const [aiProviderOverride, setAiProviderOverride] = useState<"" | "anthropic" | "openai" | "gemini">("");
  const [contextPreview, setContextPreview] = useState<{ title: string; text: string } | null>(null);

  useEffect(() => {
    if (!contextPreview) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextPreview(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [contextPreview]);

  const format: VideoFormat = selectedFormats.length === 2
    ? "both"
    : selectedFormats[0] ?? "video";

  function toggleFormat(id: "video" | "short") {
    setSelectedFormats((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
    setCreatedCount(null);
  }

  async function generateSubjects() {
    setLoading(true);
    setError(null);
    setCreatedCount(null);
    try {
      const response = await fetch(`/api/channel/${channelId}/create-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          quantity,
          durationMinutes,
          format,
          aiProviderOverride: aiProviderOverride || null,
          useSuccessfulTitles,
          includeManchete: useSuccessfulTitles,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.plan) {
        throw new Error(data.error ?? `Não foi possível gerar os assuntos (HTTP ${response.status})`);
      }
      setCreatedCount(Array.isArray(data.plan.items) ? data.plan.items.length : quantity);
      router.refresh();
      openSection("ideas");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(/fetch failed|network|failed to fetch/i.test(message)
        ? "Falha de rede ao gerar assuntos. Tente novamente."
        : message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="channel-view-generation-layout" aria-labelledby="channel-view-generator-title">
      <div className="channel-view-generator">
        <h2 id="channel-view-generator-title">Criar conteúdo com IA</h2>
        <p className="channel-view-generator-description">
          Descreva um tema ou deixe em branco para a IA sugerir assuntos com base nas informações deste canal.
          Você pode selecionar os formatos desejados e a quantidade de ideias.
        </p>

        <label className="channel-view-prompt-label" htmlFor="channel-subject-prompt">Prompt para geração</label>
        <div className="channel-view-prompt-field">
          <textarea
            id="channel-subject-prompt"
            value={topic}
            maxLength={500}
            onChange={(event) => { setTopic(event.target.value); setCreatedCount(null); }}
            placeholder={exampleTopic || "Descreva um tema ou deixe em branco para usar o DNA do canal…"}
          />
          <span>{topic.length}/500</span>
        </div>

        <fieldset className="channel-view-output-fieldset">
          <legend>Formatos de saída</legend>
          <div className="channel-view-output-options">
            {OUTPUT_FORMATS.map((option) => {
              const checked = selectedFormats.includes(option.id);
              return (
                <label className={`channel-view-output-option${checked ? " selected" : ""}`} key={option.id}>
                  <input type="checkbox" checked={checked} onChange={() => toggleFormat(option.id)} />
                  <span className="channel-view-output-check" aria-hidden="true">{checked ? "✓" : ""}</span>
                  <OutputMark format={option.id} />
                  <span className="channel-view-output-copy">
                    <strong>{option.title}</strong>
                    <small>{option.id === "video" ? `Vídeos (${durationMinutes} min)` : "Vídeos verticais"}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="channel-view-generator-actions">
          <label htmlFor="channel-subject-quantity">Quantidade de assuntos</label>
          <select id="channel-subject-quantity" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}>
            {[1, 3, 5, 10].map((amount) => <option key={amount} value={amount}>{amount} ideias</option>)}
          </select>
          <button type="button" onClick={() => void generateSubjects()} disabled={loading || selectedFormats.length === 0}>
            {loading ? "Gerando assuntos…" : "Gerar assuntos com IA"}<span aria-hidden="true">→</span>
          </button>
        </div>
        {error && <p className="channel-view-generator-feedback error" role="alert">{error}</p>}
        {createdCount !== null && <p className="channel-view-generator-feedback success" role="status">{createdCount} assuntos gerados e salvos no canal.</p>}
      </div>

      <aside className="channel-view-channel-summary" aria-labelledby="channel-view-summary-title">
        <h3 id="channel-view-summary-title">Contexto para gerar assuntos</h3>

        <div className="channel-view-successful-titles-row">
          <label className={`channel-view-successful-titles${successfulTitles.length === 0 ? " unavailable" : ""}`}>
            <input
              type="checkbox"
              checked={useSuccessfulTitles}
              disabled={successfulTitles.length === 0}
              onChange={(event) => setUseSuccessfulTitles(event.target.checked)}
            />
            <span className="channel-view-context-checkbox" aria-hidden="true">{useSuccessfulTitles ? "✓" : ""}</span>
            <span className="channel-view-context-checkbox-copy">
              <strong>Usar títulos que mais viralizaram</strong>
              <small>{successfulTitles.length > 0 ? `${successfulTitles.length} títulos cadastrados` : "Nenhum título de sucesso cadastrado"}</small>
            </span>
          </label>
          {successfulTitles.length > 0 && (
            <PreviewIconButton
              label="títulos que mais viralizaram"
              onClick={() => setContextPreview({ title: "Títulos que mais viralizaram", text: successfulTitles.map((title, index) => `${index + 1}. ${title}`).join("\n") })}
            />
          )}
        </div>

        <label className="channel-view-successful-titles channel-view-automated-generation unavailable">
          <input type="checkbox" disabled aria-label="Geração automatizada completa — em breve" />
          <span className="channel-view-context-checkbox" aria-hidden="true" />
          <span className="channel-view-context-checkbox-copy">
            <strong>Geração automatizada completa</strong>
            <small>Assunto → roteiro → capa → áudio → vídeo · Em breve</small>
          </span>
        </label>

        <label className="channel-view-model-field" htmlFor="channel-subject-model">
          <span>Modelo de IA</span>
          <select id="channel-subject-model" value={aiProviderOverride} onChange={(event) => setAiProviderOverride(event.target.value as typeof aiProviderOverride)}>
            <option value="">Padrão do sistema (AI_PROVIDER)</option>
            <option value="anthropic">Claude (Anthropic)</option>
            <option value="openai">ChatGPT (OpenAI)</option>
            <option value="gemini">Gemini (Google)</option>
          </select>
        </label>
        <div className="channel-view-context-list">
          {channelPrompt && (
            <div className="channel-view-context-item">
              <span className="channel-view-context-item-copy">
                <span>Prompt do canal</span>
                <strong>{channelPrompt}</strong>
              </span>
              <PreviewIconButton label="prompt do canal" onClick={() => setContextPreview({ title: "Prompt do canal", text: channelPrompt })} />
            </div>
          )}
          {channelContext.map((item) => (
            <div className="channel-view-context-item" key={item.label}>
              <span className="channel-view-context-item-copy">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </span>
              <PreviewIconButton label={item.label.toLowerCase()} onClick={() => setContextPreview({ title: item.label, text: item.value })} />
            </div>
          ))}
        </div>
      </aside>

      {contextPreview && (
        <div className="channel-view-context-preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setContextPreview(null); }}>
          <section className="channel-view-context-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="channel-view-context-preview-title">
            <div className="channel-view-context-preview-heading">
              <h4 id="channel-view-context-preview-title">{contextPreview.title}</h4>
              <button type="button" aria-label="Fechar pré-visualização" onClick={() => setContextPreview(null)}>×</button>
            </div>
            <div className="channel-view-context-preview-content">{contextPreview.text}</div>
          </section>
        </div>
      )}
    </section>
  );
}
