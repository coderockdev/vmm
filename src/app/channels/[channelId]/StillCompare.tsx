"use client";

import React, { useEffect, useState } from "react";
import {
  STILL_IMAGE_CHOICES,
  STILLS_PER_TEN_MINUTES,
  formatStillUsd,
  stillImageChoice,
  type StillImageChoice,
} from "../../../core/providers/image/stillChoices";

type Sample = { url: string; error?: string };

export function StillCompare({ channelId, audiobook }: { channelId: string; audiobook: boolean }) {
  const [prompt, setPrompt] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [samples, setSamples] = useState<Record<string, Sample>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = STILL_IMAGE_CHOICES.reduce((sum, choice) => sum + choice.usd, 0);
  const saved = stillImageChoice(chosen);

  useEffect(() => {
    void fetch(`/api/channels/${channelId}/still-samples`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return;
        setPrompt(String(json.prompt ?? ""));
        setChosen(typeof json.stillImage === "string" ? json.stillImage : null);
      })
      .catch(() => undefined);
  }, [channelId]);

  async function generateOne(choice: StillImageChoice): Promise<void> {
    setBusy(choice.id);
    const res = await fetch(`/api/channels/${channelId}/still-samples`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choiceId: choice.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSamples((prev) => ({ ...prev, [choice.id]: { url: "", error: json.error ?? `HTTP ${res.status}` } }));
      return;
    }
    setSamples((prev) => ({ ...prev, [choice.id]: { url: String(json.url ?? "") } }));
  }

  async function generateAll() {
    setError(null);
    setMessage(null);
    try {
      for (const choice of STILL_IMAGE_CHOICES) {
        await generateOne(choice);
      }
      setMessage("As seis imagens usaram o mesmo pedido. Escolhe a que fica no DNA.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function keep(choice: StillImageChoice) {
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/channels/${channelId}/still-samples`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choiceId: choice.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? `HTTP ${res.status}`);
      return;
    }
    setChosen(choice.id);
    setMessage(`${choice.label} ficou no DNA. ${formatStillUsd(choice.usd)} por imagem.`);
  }

  return (
    <section className="review-queue-section">
      <div className="workspace-section-title">
        <h2>Imagens</h2>
        <p>
          O mesmo pedido, uma imagem de cada qualidade. Serve para ver o desenho e o preço antes de
          gastar um capítulo inteiro.
        </p>
      </div>
      <p className="books-muted">
        Guardada no DNA: {saved.label}, {formatStillUsd(saved.usd)} cada.
        {audiobook
          ? ` Num capítulo de 10 minutos, cerca de ${STILLS_PER_TEN_MINUTES} imagens ficam em ${formatStillUsd(saved.usd * STILLS_PER_TEN_MINUTES)}.`
          : " Este canal ainda não gasta isto em cada vídeo. A escolha fica para quando gerar imagens."}
      </p>
      {prompt && (
        <p className="books-muted" style={{ whiteSpace: "pre-wrap" }}>
          Pedido igual para as seis: {prompt}
        </p>
      )}
      <div className="books-row-actions">
        <button type="button" disabled={busy !== null} onClick={() => void generateAll()}>
          {busy ? "A gerar…" : `Gerar uma de cada · ${formatStillUsd(total)}`}
        </button>
      </div>
      {message && <p className="books-ok">{message}</p>}
      {error && <p className="generation-error">{error}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginTop: 16 }}>
        {STILL_IMAGE_CHOICES.map((choice) => {
          const sample = samples[choice.id];
          const selected = stillImageChoice(chosen).id === choice.id;
          return (
            <article
              key={choice.id}
              style={{
                border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 12,
                padding: 12,
                background: "var(--surface)",
              }}
            >
              <strong>{choice.label}</strong>
              <p className="books-muted" style={{ margin: "6px 0" }}>
                {formatStillUsd(choice.usd)} · {choice.offer}
              </p>
              <div style={{ aspectRatio: "16 / 9", background: "var(--border)", borderRadius: 8, overflow: "hidden" }}>
                {sample?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sample.url} alt={choice.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span className="books-muted" style={{ display: "block", padding: 12 }}>
                    {busy === choice.id ? "A gerar esta…" : sample?.error || "Ainda sem imagem"}
                  </span>
                )}
              </div>
              <div className="books-row-actions" style={{ marginTop: 8 }}>
                <button type="button" disabled={busy !== null} onClick={() => void keep(choice)}>
                  {selected ? "Escolhida" : "Usar neste canal"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
