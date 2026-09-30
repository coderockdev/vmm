"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { ChannelAudiobookSettings } from "../../../core/types";
import type { AuditionProvider, AuditionVoice } from "../../../core/audiobook/auditionVoices";

type ProviderGroup = { id: AuditionProvider; label: string };

export function AudiobookVoicePanel({ channelId }: { channelId: string }) {
  const [settings, setSettings] = useState<ChannelAudiobookSettings | null>(null);
  const [providers, setProviders] = useState<ProviderGroup[]>([]);
  const [voices, setVoices] = useState<AuditionVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [clips, setClips] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/audiobook/settings`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSettings(json.settings);
      setProviders(json.providers ?? []);
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

  async function saveVoice(voice: AuditionVoice) {
    setSavingId(voice.id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/audiobook/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttsProvider: voice.provider, ttsVoice: voice.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSettings(json.settings);
      setMessage(`${voice.name} ficou como voz padrão do canal.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  }

  async function playVoice(voice: AuditionVoice) {
    setRowError((prev) => {
      const next = { ...prev };
      delete next[voice.id];
      return next;
    });
    if (clips[voice.id]) {
      setPlayingId(voice.id);
      return;
    }
    setPlayingId(voice.id);
    try {
      const res = await fetch(`/api/channels/${channelId}/audiobook/sample`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: voice.provider, voiceId: voice.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setClips((prev) => ({ ...prev, [voice.id]: json.audio as string }));
    } catch (err) {
      setPlayingId(null);
      setRowError((prev) => ({
        ...prev,
        [voice.id]: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  if (loading) {
    return <p className="books-muted">A carregar vozes…</p>;
  }

  if (!settings) {
    return <p className="generation-error">{error || "Sem definições de audiolivro."}</p>;
  }

  const current = voices.find((v) => v.id === settings.ttsVoice);

  return (
    <div className="audiobook-voice-panel">
      <div className="workspace-section-title">
        <h2>Voz do audiolivro</h2>
        <p>
          Seis casas, vozes masculinas em português. Ouve <strong>uma de cada vez</strong> e clica em{" "}
          <strong>Usar como padrão</strong>. Essa fica gravada no canal. Google Cloud Chirp não se
          chama daqui: era o pedido que ficava em 504.
        </p>
      </div>

      <p className="books-muted">
        Padrão atual:{" "}
        <strong>
          {current ? `${current.name} · ${providers.find((p) => p.id === current.provider)?.label ?? current.provider}` : settings.ttsVoice}
        </strong>
      </p>
      {message && <p className="books-ok">{message}</p>}
      {error && <p className="generation-error">{error}</p>}

      {providers.map((group) => {
        const rows = voices.filter((v) => v.provider === group.id);
        if (rows.length === 0) return null;
        return (
          <section key={group.id} className="audiobook-voice-card">
            <h3>{group.label}</h3>
            {rows.map((voice) => {
              const isDefault = voice.id === settings.ttsVoice;
              const clip = clips[voice.id];
              const busy = playingId === voice.id && !clip;
              return (
                <div
                  key={voice.id}
                  className={`audiobook-voice-row${isDefault ? " is-default" : ""}`}
                >
                  <div className="audiobook-voice-row-main">
                    <strong>{voice.name}</strong>
                    <span className="books-muted">
                      {voice.note} · {voice.cost}
                    </span>
                    {isDefault && (
                      <span className="books-status books-status-in_progress">padrão</span>
                    )}
                  </div>
                  <div className="audiobook-voice-row-actions">
                    <button
                      type="button"
                      disabled={busy || Boolean(savingId)}
                      onClick={() => void playVoice(voice)}
                    >
                      {busy ? "A gerar…" : clip ? "Ouvir de novo" : "Ouvir"}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(savingId) || isDefault}
                      onClick={() => void saveVoice(voice)}
                    >
                      {savingId === voice.id ? "A gravar…" : isDefault ? "Padrão" : "Usar como padrão"}
                    </button>
                  </div>
                  {clip && (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <audio
                      key={clip.slice(0, 48)}
                      controls
                      autoPlay
                      src={clip}
                      preload="auto"
                    />
                  )}
                  {rowError[voice.id] && (
                    <p className="generation-error">{rowError[voice.id]}</p>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
