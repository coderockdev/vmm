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
  const [coverPrompt, setCoverPrompt] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverSample, setCoverSample] = useState<string | null>(null);
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
        setCoverPrompt(String(json.coverPrompt ?? ""));
        setCoverUrl(typeof json.coverUrl === "string" ? json.coverUrl : null);
        setChosen(typeof json.stillImage === "string" ? json.stillImage : null);
      })
      .catch(() => undefined);
  }, [channelId]);

  async function generateOne(choice: StillImageChoice): Promise<void> {
    setBusy(choice.id);
    const res = await fetch(`/api/channels/${channelId}/still-samples`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choiceId: choice.id, prompt }),
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
    setMessage(`${choice.label} ficou no DNA. ${formatStillUsd(choice.usd)} por imagem. As capas dos vídeos passam a sair nesta qualidade.`);
  }

  async function saveCoverPrompt() {
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/channels/${channelId}/still-samples`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverPrompt }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? `HTTP ${res.status}`);
      return;
    }
    setMessage("Pedido da capa guardado no DNA. Os próximos vídeos leem este texto.");
  }

  async function generateCover(useOnChannel: boolean) {
    const choice = stillImageChoice(chosen);
    setBusy(useOnChannel ? "cover-use" : "cover");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/still-samples`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "cover",
          choiceId: choice.id,
          prompt: coverPrompt,
          useOnChannel,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      const url = String(json.url ?? "");
      setCoverSample(url);
      if (useOnChannel) setCoverUrl(url);
      setMessage(
        useOnChannel
          ? `Capa do canal atualizada em ${choice.label}. O pedido ficou no DNA.`
          : `Amostra da capa em ${choice.label}. Se servir, usa-a no canal.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="review-queue-section">
      <div className="workspace-section-title">
        <h2>Imagens</h2>
        <p>
          O mesmo pedido, uma imagem de cada qualidade. O texto sai do DNA deste canal.
          {audiobook
            ? " Serve para ver o desenho e o preço antes de gastar um capítulo inteiro."
            : " Serve para ver o desenho e o preço antes de gastar as capas."}
        </p>
      </div>
      <p className="books-muted">
        Guardada no DNA: {saved.label}, {formatStillUsd(saved.usd)} cada. As capas dos vídeos usam esta qualidade.
        {audiobook
          ? ` Num capítulo de 10 minutos, cerca de ${STILLS_PER_TEN_MINUTES} imagens ficam em ${formatStillUsd(saved.usd * STILLS_PER_TEN_MINUTES)}.`
          : ""}
      </p>
      <label className="portadas-label" style={{ display: "block", marginTop: 12 }}>
        Pedido das imagens
        <span className="books-muted" style={{ display: "block", margin: "4px 0 8px" }}>
          Sugestão deste canal, a partir do DNA dele. Podes editar antes de gerar. As seis qualidades recebem este mesmo texto.
        </span>
        <textarea value={prompt} rows={6} onChange={(event) => setPrompt(event.target.value)} style={{ width: "100%" }} />
      </label>
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

      <div style={{ marginTop: 28 }}>
        <div className="workspace-section-title">
          <h2>Capas</h2>
          <p>
            O DNA guarda o pedido geral. Aqui vês o texto que as capas leem, geras uma e, se servir, usas essa imagem como capa do canal.
          </p>
        </div>
        <label className="portadas-label" style={{ display: "block" }}>
          Pedido da capa
          <span className="books-muted" style={{ display: "block", margin: "4px 0 8px" }}>
            Sai do DNA. Guardar escreve de volta no DNA, e os próximos vídeos passam a usar este texto com {saved.label}.
          </span>
          <textarea value={coverPrompt} rows={8} onChange={(event) => setCoverPrompt(event.target.value)} style={{ width: "100%" }} />
        </label>
        <div className="books-row-actions">
          <button type="button" disabled={busy !== null || !coverPrompt.trim()} onClick={() => void saveCoverPrompt()}>
            Guardar no DNA
          </button>
          <button type="button" disabled={busy !== null || !coverPrompt.trim()} onClick={() => void generateCover(false)}>
            {busy === "cover" ? "A gerar a capa…" : `Gerar amostra · ${formatStillUsd(saved.usd)}`}
          </button>
          <button type="button" disabled={busy !== null || !coverPrompt.trim()} onClick={() => void generateCover(true)}>
            {busy === "cover-use" ? "A usar no canal…" : "Gerar e usar como capa do canal"}
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginTop: 12 }}>
          <article style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "var(--surface)" }}>
            <strong>Capa do canal</strong>
            <div style={{ aspectRatio: "16 / 9", background: "var(--border)", borderRadius: 8, overflow: "hidden", marginTop: 8 }}>
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="Capa do canal" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span className="books-muted" style={{ display: "block", padding: 12 }}>Ainda sem capa</span>
              )}
            </div>
          </article>
          <article style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "var(--surface)" }}>
            <strong>Amostra</strong>
            <div style={{ aspectRatio: "16 / 9", background: "var(--border)", borderRadius: 8, overflow: "hidden", marginTop: 8 }}>
              {coverSample ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverSample} alt="Amostra da capa" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span className="books-muted" style={{ display: "block", padding: 12 }}>
                  {busy === "cover" || busy === "cover-use" ? "A gerar esta…" : "Ainda sem amostra"}
                </span>
              )}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
