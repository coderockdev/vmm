"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { ChannelAudiobookSettings } from "../../../core/types";

type VoiceOption = { id: string; label: string };
type Sample = { voiceId: string; label: string; url: string };

export function AudiobookVoicePanel({ channelId }: { channelId: string }) {
  const [settings, setSettings] = useState<ChannelAudiobookSettings | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sampleText, setSampleText] = useState<string | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/audiobook/settings`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSettings(json.settings);
      setVoices(json.voices ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveVoice(voiceId: string) {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/audiobook/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttsVoice: voiceId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSettings(json.settings);
      setMessage(`Voz guardada: ${voiceId.replace("pt-BR-Chirp3-HD-", "")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveRate(rate: number) {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/audiobook/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttsSpeakingRate: rate }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSettings(json.settings);
      setMessage(`Velocidade: ${rate}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function testVoices() {
    setTesting(true);
    setError(null);
    setMessage(null);
    setSamples([]);
    try {
      const res = await fetch(`/api/channels/${channelId}/audiobook/test-voices`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSampleText(json.sampleText ?? null);
      setSamples(json.samples ?? []);
      setMessage(json.message ?? null);
      if (json.errors?.length && !(json.samples ?? []).length) {
        setError(json.errors.join(" · "));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <p className="books-muted">A carregar definições de voz…</p>;
  }

  if (!settings) {
    return <p className="generation-error">{error || "Sem definições de audiolivro."}</p>;
  }

  const selectedShort = settings.ttsVoice.replace("pt-BR-Chirp3-HD-", "");

  return (
    <div className="audiobook-voice-panel">
      <div className="workspace-section-title">
        <h2>Voz do audiolivro</h2>
        <p>
          Define a voz Chirp 3 HD <strong>antes</strong> de gerar capítulos. A escolha fica fixa no
          canal. Teste com ~800 caracteres do capítulo 1 da primeira obra.
        </p>
      </div>

      <div className="audiobook-voice-card">
        <label className="portadas-label">
          Voz ativa
          <select
            value={settings.ttsVoice}
            disabled={saving}
            onChange={(e) => void saveVoice(e.target.value)}
          >
            {(voices.length
              ? voices
              : [
                  { id: "pt-BR-Chirp3-HD-Charon", label: "Charon" },
                  { id: "pt-BR-Chirp3-HD-Orus", label: "Orus" },
                  { id: "pt-BR-Chirp3-HD-Fenrir", label: "Fenrir" },
                ]
            ).map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <label className="portadas-label">
          Velocidade ({settings.ttsSpeakingRate})
          <input
            type="range"
            min={0.8}
            max={1.1}
            step={0.05}
            value={settings.ttsSpeakingRate}
            disabled={saving}
            onChange={(e) => void saveRate(Number(e.target.value))}
          />
        </label>

        <p className="books-muted">
          Atual: <strong>{selectedShort}</strong> · idioma {settings.ttsLanguageCode} · limite mensal{" "}
          {settings.ttsMonthlyCharLimit.toLocaleString("pt-BR")} caracteres
        </p>

        <div className="portadas-actions">
          <button type="button" disabled={testing || saving} onClick={() => void testVoices()}>
            {testing ? "A gerar testes…" : "Testar vozes (Charon · Orus · Fenrir)"}
          </button>
        </div>

        {message && <p className="books-ok">{message}</p>}
        {error && <p className="generation-error">{error}</p>}

        {sampleText && (
          <details className="audiobook-sample-text">
            <summary>Texto de amostra (~{sampleText.length} chars)</summary>
            <pre>{sampleText}</pre>
          </details>
        )}

        {samples.length > 0 && (
          <div className="audiobook-voice-samples">
            {samples.map((s) => (
              <div key={s.voiceId} className="audiobook-voice-sample">
                <div className="audiobook-voice-sample-head">
                  <strong>{s.label}</strong>
                  {s.voiceId === settings.ttsVoice && (
                    <span className="books-status books-status-in_progress">selecionada</span>
                  )}
                  <button type="button" disabled={saving} onClick={() => void saveVoice(s.voiceId)}>
                    Usar esta
                  </button>
                </div>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio controls src={s.url} preload="none" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="audiobook-voice-card audiobook-youtube-stub">
        <h3>YouTube</h3>
        <p className="books-muted">
          Liga a conta Google deste canal na aba <strong>YouTube</strong> (OAuth). Upload automático
          de capítulos vem a seguir.
        </p>
        <p className="books-muted" style={{ marginTop: 8 }}>
          Publicação prevista: {settings.publishTimeLocal} · a cada {settings.publishEveryDays}{" "}
          dia(s) · máx. {settings.maxUploadsPerDay}/dia
        </p>
      </div>
    </div>
  );
}
