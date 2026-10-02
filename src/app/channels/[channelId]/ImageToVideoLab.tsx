"use client";

import React, { useEffect, useState } from "react";
import type { AudiobookVisualBudget, ImageToVideoProviderId } from "../../../core/types";
import { DEFAULT_AUDIOBOOK_SETTINGS } from "../../../core/types";
import { formatUsd, normalizeVisualBudget } from "../../../core/audiobook/visualBudget";

type ProviderCard = {
  id: ImageToVideoProviderId;
  label: string;
  models: string[];
  configured: boolean;
};

type Note = {
  id: string;
  provider: string;
  model: string;
  durationSec: number;
  cost: string;
  quality: string;
  seconds: string;
  preview: string;
};

const FIELDS: Array<{ key: keyof AudiobookVisualBudget; label: string; step: string }> = [
  { key: "staticImageBudgetUsd", label: "Imagens / 10 min (US$)", step: "0.01" },
  { key: "aiVideoBudgetUsd", label: "Animação IA / 10 min (US$)", step: "0.01" },
  { key: "voiceBudgetUsd", label: "Voz / 10 min (US$)", step: "0.01" },
  { key: "scriptCostUsd", label: "Roteiro por capítulo (US$)", step: "0.01" },
  { key: "maxCostPerChapterUsd", label: "Limite por capítulo (US$)", step: "0.01" },
  { key: "autoApproveUnderUsd", label: "Aprovar sozinho até (US$)", step: "0.01" },
  { key: "staticImagesPerReference", label: "Imagens na referência", step: "1" },
  { key: "aiClipsPerReference", label: "Clipes IA na referência", step: "1" },
  { key: "minStaticImages", label: "Mínimo de imagens", step: "1" },
  { key: "maxStaticImages", label: "Máximo de imagens", step: "1" },
  { key: "minAiClips", label: "Mínimo de clipes", step: "1" },
  { key: "maxAiClips", label: "Máximo de clipes", step: "1" },
];

export function ImageToVideoLab({ channelId }: { channelId: string }) {
  const [budget, setBudget] = useState<AudiobookVisualBudget>(DEFAULT_AUDIOBOOK_SETTINGS.visualBudget);
  const [providers, setProviders] = useState<ProviderCard[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [providerId, setProviderId] = useState<ImageToVideoProviderId>("fal");
  const [model, setModel] = useState("fal-ai/wan/v2.2-a14b/image-to-video/turbo");
  const [durationSec, setDurationSec] = useState(6);
  const [imageRef, setImageRef] = useState("");
  const [prompt, setPrompt] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState({ cost: "", quality: "", seconds: "", preview: "" });

  useEffect(() => {
    void fetch(`/api/channels/${channelId}/audiobook/settings`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return;
        setBudget(normalizeVisualBudget(json.settings?.visualBudget));
      })
      .catch(() => undefined);
    void fetch(`/api/channels/${channelId}/audiobook/image-to-video`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return;
        setProviders(json.providers ?? []);
      })
      .catch(() => undefined);
  }, [channelId]);

  const selected = providers.find((item) => item.id === providerId) ?? providers[0];

  async function saveBudget(patch: Partial<AudiobookVisualBudget>) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/audiobook/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visualBudget: patch }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setBudget(normalizeVisualBudget(json.settings?.visualBudget));
      setMessage("Orçamento guardado. A produção em massa continua desligada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function tryGenerate() {
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/channels/${channelId}/audiobook/image-to-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: providerId,
        model: model || selected?.models[0],
        durationSec,
        imageRef,
        prompt,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? `HTTP ${res.status}`);
      return;
    }
    setMessage(json.result?.message ?? "Sem resultado.");
  }

  return (
    <section className="review-queue-section">
      <div className="workspace-section-title">
        <h2>Laboratório de imagem para vídeo</h2>
        <p>
          Um capítulo de teste de cada vez. A referência de 10 minutos é cerca de 10 ilustrações, 5 clipes e{" "}
          {formatUsd(
            budget.staticImageBudgetUsd + budget.aiVideoBudgetUsd + budget.voiceBudgetUsd + budget.scriptCostUsd
          )}
          . O sistema não escolhe o vencedor.
        </p>
      </div>

      <form
        className="lab-budget"
        onSubmit={(event) => {
          event.preventDefault();
          void saveBudget(budget);
        }}
      >
        <h3>Orçamento configurável</h3>
        <div className="lab-budget-grid">
          {FIELDS.map((field) => (
            <label key={field.key}>
              {field.label}
              <input
                type="number"
                min={0}
                step={field.step}
                value={Number(budget[field.key] ?? 0)}
                onChange={(event) =>
                  setBudget((prev) =>
                    normalizeVisualBudget({ ...prev, [field.key]: Number(event.target.value) })
                  )
                }
              />
            </label>
          ))}
        </div>
        <button type="submit" disabled={saving}>
          {saving ? "A guardar…" : "Guardar orçamento"}
        </button>
      </form>

      <div className="lab-providers">
        {providers.map((item) => (
          <article key={item.id} className={budget.favoriteImageToVideoProvider === item.id ? "is-favorite" : ""}>
            <strong>{item.label}</strong>
            <span>{item.configured ? "Chave presente" : "Sem chave"}</span>
            <span>{item.models.join(", ")}</span>
            <div className="books-row-actions">
              <button type="button" onClick={() => void saveBudget({ favoriteImageToVideoProvider: item.id })}>
                {budget.favoriteImageToVideoProvider === item.id ? "Favorito" : "Marcar favorito"}
              </button>
              <button type="button" onClick={() => void saveBudget({ defaultImageToVideoProvider: item.id })}>
                {budget.defaultImageToVideoProvider === item.id ? "Padrão" : "Usar como padrão"}
              </button>
            </div>
          </article>
        ))}
      </div>

      <form
        className="lab-try"
        onSubmit={(event) => {
          event.preventDefault();
          void tryGenerate();
        }}
      >
        <h3>Um clipe, uma imagem</h3>
        <label>
          Provedor
          <select
            value={providerId}
            onChange={(event) => {
              const id = event.target.value as ImageToVideoProviderId;
              setProviderId(id);
              const next = providers.find((item) => item.id === id);
              setModel(next?.models[0] ?? "");
            }}
          >
            {providers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Modelo
          <select value={model} onChange={(event) => setModel(event.target.value)}>
            {(selected?.models ?? [model]).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Duração (s)
          <input
            type="number"
            min={2}
            max={10}
            value={durationSec}
            onChange={(event) => setDurationSec(Number(event.target.value))}
          />
        </label>
        <label>
          Imagem
          <input
            value={imageRef}
            placeholder="caminho ou URL da ilustração"
            onChange={(event) => setImageRef(event.target.value)}
          />
        </label>
        <label className="lab-prompt">
          Prompt
          <textarea value={prompt} rows={4} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <button type="submit">Pedir clipe</button>
      </form>

      <form
        className="lab-try"
        onSubmit={(event) => {
          event.preventDefault();
          setNotes((prev) => [
            {
              id: `${Date.now()}`,
              provider: selected?.label ?? providerId,
              model,
              durationSec,
              cost: draft.cost,
              quality: draft.quality,
              seconds: draft.seconds,
              preview: draft.preview,
            },
            ...prev,
          ]);
        }}
      >
        <h3>Registar um teste visto à mão</h3>
        <label>
          Custo
          <input value={draft.cost} onChange={(event) => setDraft((prev) => ({ ...prev, cost: event.target.value }))} />
        </label>
        <label>
          Qualidade
          <input
            value={draft.quality}
            onChange={(event) => setDraft((prev) => ({ ...prev, quality: event.target.value }))}
          />
        </label>
        <label>
          Tempo de geração
          <input
            value={draft.seconds}
            onChange={(event) => setDraft((prev) => ({ ...prev, seconds: event.target.value }))}
          />
        </label>
        <label>
          Pré-visualização
          <input
            value={draft.preview}
            onChange={(event) => setDraft((prev) => ({ ...prev, preview: event.target.value }))}
          />
        </label>
        <button type="submit">Registar</button>
      </form>

      {notes.length > 0 && (
        <table className="books-table">
          <thead>
            <tr>
              <th>Provedor</th>
              <th>Modelo</th>
              <th>Duração</th>
              <th>Custo</th>
              <th>Qualidade</th>
              <th>Tempo</th>
              <th>Prévia</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((note) => (
              <tr key={note.id}>
                <td>{note.provider}</td>
                <td>{note.model}</td>
                <td>{note.durationSec}s</td>
                <td>{note.cost}</td>
                <td>{note.quality}</td>
                <td>{note.seconds}</td>
                <td>{note.preview}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {message && <p className="books-ok">{message}</p>}
      {error && <p className="generation-error">{error}</p>}
    </section>
  );
}
