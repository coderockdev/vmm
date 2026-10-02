"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { ChannelAudiobookSettings } from "../../../core/types";
import type { AuditionProvider, AuditionVoice } from "../../../core/audiobook/auditionVoices";

type ProviderGroup = { id: AuditionProvider; label: string };
type CartesiaGender = "all" | "masculine" | "feminine";

const LANGUAGE_LABEL: Record<string, string> = {
  pt: "português",
  es: "espanhol",
  en: "inglês",
};

function genderNote(gender: string): string {
  if (gender === "masculine") return "masculina";
  if (gender === "feminine") return "feminina";
  return gender;
}

export function AudiobookVoicePanel({ channelId }: { channelId: string }) {
  const [settings, setSettings] = useState<ChannelAudiobookSettings | null>(null);
  const [providers, setProviders] = useState<ProviderGroup[]>([]);
  const [voices, setVoices] = useState<AuditionVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [clips, setClips] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [language, setLanguage] = useState("pt");
  const [cartesiaVoices, setCartesiaVoices] = useState<AuditionVoice[]>([]);
  const [cartesiaQuery, setCartesiaQuery] = useState("");
  const [cartesiaGender, setCartesiaGender] = useState<CartesiaGender>("all");
  const [chirpQuery, setChirpQuery] = useState("");
  const [chirpGender, setChirpGender] = useState<CartesiaGender>("all");
  const [cartesiaLoading, setCartesiaLoading] = useState(false);
  const [cartesiaError, setCartesiaError] = useState<string | null>(null);
  const [cartesiaCursor, setCartesiaCursor] = useState<string | null>(null);
  const [cartesiaHasMore, setCartesiaHasMore] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/audiobook/settings`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSettings(json.settings);
      setLanguage(typeof json.language === "string" ? json.language : "pt");
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

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setCartesiaLoading(true);
      setCartesiaError(null);
      const params = new URLSearchParams({
        language,
        gender: cartesiaGender,
        limit: "24",
      });
      if (cartesiaQuery.trim()) params.set("q", cartesiaQuery.trim());
      void fetch(`/api/voices/cartesia?${params}`)
        .then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
          if (cancelled) return;
          const list = (json.voices ?? []) as Array<{
            id: string;
            name: string;
            accent?: string;
            gender?: string;
            description?: string;
          }>;
          setCartesiaVoices(
            list.map((voice) => ({
              provider: "cartesia" as const,
              id: voice.id,
              name: voice.name,
              note: [genderNote(voice.gender ?? ""), voice.accent, voice.description]
                .filter(Boolean)
                .join(" · "),
              cost: "Barata",
              canSample: true,
            }))
          );
          setCartesiaCursor(json.nextStartingAfter ?? null);
          setCartesiaHasMore(Boolean(json.hasMore));
        })
        .catch((err) => {
          if (cancelled) return;
          setCartesiaVoices([]);
          setCartesiaError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!cancelled) setCartesiaLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [language, cartesiaGender, cartesiaQuery]);

  async function saveRate(ttsSpeakingRate: number) {
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/audiobook/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttsSpeakingRate }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSettings(json.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

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
        body: JSON.stringify({
          provider: voice.provider,
          voiceId: voice.id,
          speed: settings?.ttsSpeakingRate,
        }),
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

  const current =
    cartesiaVoices.find((v) => v.id === settings.ttsVoice) ??
    voices.find((v) => v.id === settings.ttsVoice);
  const languageName = LANGUAGE_LABEL[language] ?? language;

  async function loadMoreCartesia() {
    if (!cartesiaCursor || cartesiaLoading) return;
    setCartesiaLoading(true);
    setCartesiaError(null);
    try {
      const params = new URLSearchParams({
        language,
        gender: cartesiaGender,
        limit: "24",
        starting_after: cartesiaCursor,
      });
      if (cartesiaQuery.trim()) params.set("q", cartesiaQuery.trim());
      const res = await fetch(`/api/voices/cartesia?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const list = (json.voices ?? []) as Array<{
        id: string;
        name: string;
        accent?: string;
        gender?: string;
        description?: string;
      }>;
      setCartesiaVoices((prev) => {
        const seen = new Set(prev.map((voice) => voice.id));
        const extra = list
          .filter((voice) => voice.id && !seen.has(voice.id))
          .map((voice) => ({
            provider: "cartesia" as const,
            id: voice.id,
            name: voice.name,
            note: [genderNote(voice.gender ?? ""), voice.accent, voice.description]
              .filter(Boolean)
              .join(" · "),
            cost: "Barata",
            canSample: true,
          }));
        return [...prev, ...extra];
      });
      setCartesiaCursor(json.nextStartingAfter ?? null);
      setCartesiaHasMore(Boolean(json.hasMore));
    } catch (err) {
      setCartesiaError(err instanceof Error ? err.message : String(err));
    } finally {
      setCartesiaLoading(false);
    }
  }

  return (
    <div className="audiobook-voice-panel">
      <div className="workspace-section-title">
        <h2>Voz do audiolivro</h2>
        <p>
          Google Cloud lista as vozes Chirp em <strong>{languageName}</strong>. Ouve uma e clica em{" "}
          <strong>Usar como padrão</strong>. As outras casas ficam abaixo.
        </p>
      </div>

      {settings && (
        <label className="audiobook-speed">
          <span>
            Velocidade {settings.ttsSpeakingRate.toFixed(2)}
            <small>
              1,00 é o ritmo natural. 0,95 deixa tempo para acompanhar o capítulo. Chirp não aceita
              velocidade na API: o ajuste é feito no áudio.
            </small>
          </span>
          <input
            type="range"
            min={0.85}
            max={1.05}
            step={0.01}
            value={settings.ttsSpeakingRate}
            onChange={(event) => {
              const ttsSpeakingRate = Number(event.target.value);
              setSettings({ ...settings, ttsSpeakingRate });
              setClips({});
            }}
            onPointerUp={(event) => {
              const ttsSpeakingRate = Number((event.target as HTMLInputElement).value);
              void saveRate(ttsSpeakingRate);
            }}
          />
        </label>
      )}

      <p className="books-muted">
        Padrão atual:{" "}
        <strong>
          {current ? `${current.name} · ${providers.find((p) => p.id === current.provider)?.label ?? current.provider}` : settings.ttsVoice}
        </strong>
      </p>
      {message && <p className="books-ok">{message}</p>}
      {error && <p className="generation-error">{error}</p>}

      {providers.map((group) => {
        const rows =
          group.id === "cartesia"
            ? cartesiaVoices.length > 0
              ? cartesiaVoices
              : cartesiaError
                ? voices.filter((v) => v.provider === "cartesia")
                : []
            : group.id === "google"
              ? voices.filter((voice) => {
                  if (voice.provider !== "google") return false;
                  if (chirpGender === "masculine" && !voice.note.startsWith("masculina")) return false;
                  if (chirpGender === "feminine" && !voice.note.startsWith("feminina")) return false;
                  const q = chirpQuery.trim().toLowerCase();
                  return !q || voice.name.toLowerCase().includes(q) || voice.note.toLowerCase().includes(q);
                })
              : voices.filter((v) => v.provider === group.id);
        if (group.id !== "cartesia" && group.id !== "google" && rows.length === 0) return null;
        return (
          <section key={group.id} className="audiobook-voice-card">
            <h3>
              {group.label}
              {group.id === "cartesia" || group.id === "google" ? ` · ${languageName}` : ""}
            </h3>
            {group.id === "google" && (
              <div className="audiobook-voice-filters">
                <input
                  value={chirpQuery}
                  onChange={(event) => setChirpQuery(event.target.value)}
                  placeholder={`Buscar voz Chirp em ${languageName}…`}
                  aria-label="Buscar voz Google Cloud"
                />
                <select
                  value={chirpGender}
                  onChange={(event) => setChirpGender(event.target.value as CartesiaGender)}
                  aria-label="Filtrar Chirp por gênero"
                >
                  <option value="all">Todas</option>
                  <option value="masculine">Masculinas</option>
                  <option value="feminine">Femininas</option>
                </select>
              </div>
            )}
            {group.id === "cartesia" && (
              <div className="audiobook-voice-filters">
                <input
                  value={cartesiaQuery}
                  onChange={(event) => setCartesiaQuery(event.target.value)}
                  placeholder={`Buscar voz em ${languageName}…`}
                  aria-label="Buscar voz Cartesia"
                />
                <select
                  value={cartesiaGender}
                  onChange={(event) => setCartesiaGender(event.target.value as CartesiaGender)}
                  aria-label="Filtrar por gênero"
                >
                  <option value="all">Todas</option>
                  <option value="masculine">Masculinas</option>
                  <option value="feminine">Femininas</option>
                </select>
              </div>
            )}
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
            {group.id === "google" && rows.length === 0 && (
              <p className="books-muted">Nenhuma voz Chirp em {languageName} com esse filtro.</p>
            )}
            {group.id === "cartesia" && cartesiaLoading && (
              <p className="books-muted">A carregar vozes em {languageName}…</p>
            )}
            {group.id === "cartesia" && cartesiaError && (
              <p className="generation-error">{cartesiaError}</p>
            )}
            {group.id === "cartesia" && !cartesiaLoading && rows.length === 0 && !cartesiaError && (
              <p className="books-muted">Nenhuma voz Cartesia em {languageName} com esse filtro.</p>
            )}
            {group.id === "cartesia" && cartesiaHasMore && (
              <button type="button" disabled={cartesiaLoading} onClick={() => void loadMoreCartesia()}>
                Carregar mais
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
