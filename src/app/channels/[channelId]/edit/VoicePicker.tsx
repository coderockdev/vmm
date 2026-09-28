"use client";

import React, { useMemo, useRef, useState } from "react";
import { Language } from "../../../../core/types";
import { CatalogVoice, VOICE_CATALOG } from "../../../../core/providers/tts/voiceCatalog";
import { TTSProviderName } from "../../../../core/providers/tts/TTSProvider";

const SAMPLE_TEXT: Record<Language, string> = {
  pt: "Boa noite. Este é um teste de narração para o seu canal.",
  es: "Buenas noches. Esta es una prueba de narración para tu canal.",
  en: "Good evening. This is a narration test for your channel.",
};

const inputStyle: React.CSSProperties = { width: "100%" };
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "var(--text-dim)",
  marginBottom: 6,
  marginTop: 14,
};

export function VoicePicker({
  language,
  provider,
  voiceId,
  speed,
  onChange,
}: {
  language: Language;
  provider: TTSProviderName;
  voiceId: string | null;
  speed: number;
  onChange: (next: { provider: TTSProviderName; voiceId: string; speed: number }) => void;
}) {
  const voices = useMemo(() => VOICE_CATALOG.filter((v) => v.language === language), [language]);
  const [selected, setSelected] = useState<CatalogVoice | undefined>(
    voices.find((v) => v.provider === provider && v.id === voiceId) ?? voices[0]
  );
  const [localSpeed, setLocalSpeed] = useState(speed);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function selectVoice(voice: CatalogVoice) {
    setSelected(voice);
    setLocalSpeed(voice.recommendedSpeed);
    onChange({ provider: voice.provider, voiceId: voice.id, speed: voice.recommendedSpeed });
  }

  async function handleTest() {
    if (!selected) return;
    setTesting(true);
    setError(null);
    try {
      const res = await fetch("/api/voices/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selected.provider,
          voiceId: selected.id,
          text: SAMPLE_TEXT[language],
          speed: localSpeed,
          language,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Falha ao gerar amostra");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div>
      <label style={labelStyle}>Voz do canal</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {voices.map((voice) => {
          const isSelected = selected?.id === voice.id && selected?.provider === voice.provider;
          return (
            <label
              key={`${voice.provider}-${voice.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid " + (isSelected ? "var(--accent)" : "var(--border)"),
                background: isSelected ? "var(--accent-dim)" : "transparent",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="voice"
                checked={isSelected}
                onChange={() => selectVoice(voice)}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {voice.name}{" "}
                  <span style={{ fontWeight: 400, color: "var(--text-dim)", fontSize: 11 }}>
                    ({voice.provider})
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{voice.description}</div>
              </div>
            </label>
          );
        })}
      </div>

      {selected && (
        <>
          <label style={labelStyle}>Velocidade ({localSpeed.toFixed(2)}x)</label>
          <input
            type="range"
            min="0.6"
            max="1.3"
            step="0.01"
            value={localSpeed}
            onChange={(e) => {
              const v = Number(e.target.value);
              setLocalSpeed(v);
              onChange({ provider: selected.provider, voiceId: selected.id, speed: v });
            }}
            style={inputStyle}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              style={{
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text)",
                borderRadius: 8,
                padding: "8px 14px",
                fontSize: 13,
                cursor: testing ? "default" : "pointer",
                opacity: testing ? 0.6 : 1,
              }}
            >
              {testing ? "Gerando..." : "▶ Testar voz"}
            </button>
            <audio ref={audioRef} controls style={{ height: 32 }} />
          </div>
          {error && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>{error}</div>}
        </>
      )}
    </div>
  );
}
