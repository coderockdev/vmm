"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Language, VoiceProfile } from "../../../../core/types";
import { CatalogVoice, VOICE_CATALOG } from "../../../../core/providers/tts/voiceCatalog";
import { TTSProviderName } from "../../../../core/providers/tts/TTSProvider";
import {
  JUAN_CARLOS_HEYGEN,
  capabilitiesForProvider,
  profileFromLegacyVoice,
} from "../../../../core/providers/tts/voiceCapabilities";

type TabId = "validated" | "elevenlabs" | "cartesia" | "local";

type RemoteVoice = {
  id: string;
  name: string;
  accent?: string;
  age?: string;
  gender?: string;
  description: string;
  previewUrl: string | null;
  provider: "elevenlabs" | "cartesia";
};

const SAMPLE_TEXT: Record<Language, string> = {
  pt: "Boa noite. Este é um teste de narração para o seu canal.",
  es: "Buenas noches. Esta es una prueba de narración para tu canal. [softly] Quédate conmigo.",
  en: "Good evening. This is a narration test for your channel.",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "var(--text-dim)",
  marginBottom: 6,
  marginTop: 14,
};

function speedRange(provider: string): { min: number; max: number } {
  if (provider === "elevenlabs") return { min: 0.7, max: 1.2 };
  if (provider === "heygen") return { min: 0.5, max: 1.5 };
  return { min: 0.6, max: 1.5 };
}

function emotionBadge(profile: VoiceProfile): string {
  if (!profile.capabilities.emotion_tags) return "Emoções ✗";
  if (profile.provider === "cartesia") return "Emoções beta";
  return "Emoções ✓";
}

function pauseBadge(profile: VoiceProfile): string {
  if (profile.provider === "elevenlabs") return "Pausas → …";
  return profile.capabilities.break_tags ? "Pausas ✓" : "Pausas ✗";
}

function catalogToProfile(voice: CatalogVoice, speed: number): VoiceProfile {
  const profile = profileFromLegacyVoice({
    provider: voice.provider,
    voiceId: voice.id,
    voiceName: voice.name,
    speed,
    language: voice.language,
  });
  // Only voices explicitly marked in the catalog (none of the Cartesia ES trio yet).
  profile.validated_for_channel = Boolean(voice.validatedForChannel);
  return profile;
}

function remoteToProfile(voice: RemoteVoice, language: Language, speed: number): VoiceProfile {
  return {
    provider: voice.provider,
    voice_id: voice.id,
    voice_name: voice.name,
    model: voice.provider === "elevenlabs" ? "eleven_v3" : "sonic-3",
    language,
    locale: voice.accent,
    speed,
    stability: voice.provider === "elevenlabs" ? 0.5 : undefined,
    capabilities: capabilitiesForProvider(voice.provider),
    notes: voice.provider === "cartesia" ? "Emoções em beta; oficialmente garantidas só em inglês. Teste antes." : undefined,
  };
}

export function VoicePicker({
  language,
  profile,
  onChange,
}: {
  language: Language;
  profile: VoiceProfile;
  onChange: (next: VoiceProfile) => void;
}) {
  const [tab, setTab] = useState<TabId>(
    profile.provider === "heygen" || profile.validated_for_channel
      ? "validated"
      : profile.provider === "elevenlabs"
        ? "elevenlabs"
        : profile.provider === "local"
          ? "local"
          : profile.provider === "cartesia"
            ? "cartesia"
            : "validated"
  );
  const [localSpeed, setLocalSpeed] = useState(profile.speed);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [remote, setRemote] = useState<RemoteVoice[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [page, setPage] = useState(0);
  const [startingAfter, setStartingAfter] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [genderFilter, setGenderFilter] = useState<"male" | "all">("male");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const curated = useMemo(
    () => VOICE_CATALOG.filter((v) => v.language === language),
    [language]
  );
  const validatedCurated = useMemo(
    () => curated.filter((v) => v.validatedForChannel),
    [curated]
  );
  const localVoices = useMemo(() => curated.filter((v) => v.provider === "local"), [curated]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const loadRemote = useCallback(
    async (opts: { append: boolean; page?: number; startingAfter?: string | null }) => {
      if (tab !== "elevenlabs" && tab !== "cartesia") return;
      setLoadingRemote(true);
      setError(null);
      try {
        const gender =
          tab === "elevenlabs"
            ? genderFilter === "male"
              ? "male"
              : "all"
            : genderFilter === "male"
              ? "masculine"
              : "all";
        const params = new URLSearchParams();
        if (debouncedQ) params.set("q", debouncedQ);
        params.set("gender", gender);
        if (tab === "elevenlabs") params.set("page", String(opts.page ?? 0));
        if (tab === "cartesia" && opts.startingAfter) params.set("starting_after", opts.startingAfter);

        const res = await fetch(`/api/voices/${tab}?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Falha ao buscar vozes");
        const list: RemoteVoice[] = data.voices ?? [];
        setRemote((prev) => (opts.append ? [...prev, ...list] : list));
        setHasMore(Boolean(data.hasMore));
        setStartingAfter(data.nextStartingAfter ?? null);
        if (tab === "elevenlabs") setPage(opts.page ?? 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        if (!opts.append) setRemote([]);
      } finally {
        setLoadingRemote(false);
      }
    },
    [tab, debouncedQ, genderFilter]
  );

  useEffect(() => {
    if (tab === "elevenlabs" || tab === "cartesia") {
      setRemote([]);
      setPage(0);
      setStartingAfter(null);
      loadRemote({ append: false, page: 0 });
    }
  }, [tab, debouncedQ, genderFilter, loadRemote]);

  function selectProfile(next: VoiceProfile) {
    setLocalSpeed(next.speed);
    onChange(next);
  }

  function isSelected(p: VoiceProfile): boolean {
    return (
      profile.provider === p.provider &&
      profile.voice_id === p.voice_id &&
      (p.provider !== "heygen" || profile.heygen_template_id === p.heygen_template_id)
    );
  }

  async function playUrl(url: string) {
    if (!audioRef.current) return;
    audioRef.current.src = url;
    await audioRef.current.play();
  }

  async function handleFreePreview(previewUrl: string | null, heygen?: boolean) {
    setError(null);
    try {
      if (heygen) {
        const res = await fetch("/api/voices/heygen/preview?name=Juan%20Carlos");
        const data = await res.json();
        if (data.previewUrl) {
          await playUrl(data.previewUrl);
          return;
        }
        setError(data.message ?? "Prévia só no editor do HeyGen");
        return;
      }
      if (!previewUrl) {
        setError("Sem URL de prévia para esta voz.");
        return;
      }
      await playUrl(previewUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handlePaidTest() {
    if (!window.confirm(`Isto usa ~150 caracteres de crédito do provider ${profile.provider}. Continuar?`)) {
      return;
    }
    setTesting(true);
    setError(null);
    try {
      const res = await fetch("/api/voices/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: profile.provider,
          voiceId: profile.voice_id,
          text: SAMPLE_TEXT[language],
          speed: localSpeed,
          language,
          profile,
          paidSample: true,
          confirmPaid: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Falha ao gerar amostra");
      }
      const blob = await res.blob();
      await playUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  function renderCard(opts: {
    key: string;
    title: string;
    subtitle: string;
    profile: VoiceProfile;
    previewUrl?: string | null;
    freePreviewHeygen?: boolean;
    warning?: string;
  }) {
    const selected = isSelected(opts.profile);
    return (
      <label
        key={opts.key}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
          background: selected ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent",
          cursor: "pointer",
        }}
      >
        <input
          type="radio"
          name="voice-profile"
          checked={selected}
          onChange={() => selectProfile({ ...opts.profile, speed: localSpeed || opts.profile.speed })}
          style={{ marginTop: 4 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {opts.title}
            {opts.profile.validated_for_channel && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "#1a7f37" }}>✅ Validada Amor Amor</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>{opts.subtitle}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <span style={badgeStyle}>{emotionBadge(opts.profile)}</span>
            <span style={badgeStyle}>{pauseBadge(opts.profile)}</span>
            <span style={badgeStyle}>{opts.profile.provider}</span>
          </div>
          {opts.warning && (
            <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "6px 0 0" }}>{opts.warning}</p>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              handleFreePreview(opts.previewUrl ?? null, opts.freePreviewHeygen);
            }}
            style={previewBtnStyle}
          >
            ▶ Prévia
          </button>
        </div>
      </label>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "validated", label: "Validadas" },
    { id: "elevenlabs", label: "ElevenLabs" },
    { id: "cartesia", label: "Cartesia" },
    { id: "local", label: "Local" },
  ];

  const range = speedRange(profile.provider);

  return (
    <div>
      <label style={labelStyle}>Voz do canal</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              border: `1px solid ${tab === t.id ? "var(--accent)" : "var(--border)"}`,
              background: tab === t.id ? "var(--accent)" : "transparent",
              color: tab === t.id ? "#fff" : "var(--text)",
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "validated" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {language === "es" &&
            renderCard({
              key: "juan-carlos",
              title: "Juan Carlos — HeyGen (ElevenLabs v3)",
              subtitle: "Voz masculina madura e calorosa, com emoções. Aprovada pelo cliente.",
              profile: { ...JUAN_CARLOS_HEYGEN, speed: localSpeed || 0.9 },
              freePreviewHeygen: true,
              warning: "Velocidade real está no template HeyGen (0.9). Mudar aqui exige atualizar o template.",
            })}
          {validatedCurated.map((v) =>
            renderCard({
              key: `c-${v.id}`,
              title: `${v.name} (${v.provider})`,
              subtitle: v.description,
              profile: catalogToProfile(v, localSpeed || v.recommendedSpeed),
            })
          )}
          {language !== "es" && validatedCurated.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>
              Nenhuma voz validada ainda para este idioma. Use as abas ElevenLabs / Cartesia / Local para testar.
            </p>
          )}
          {language === "es" && validatedCurated.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "4px 0 0" }}>
              Mariana, Laura e Marta (Cartesia) ainda não foram validadas — estão na aba Cartesia.
            </p>
          )}
        </div>
      )}

      {(tab === "elevenlabs" || tab === "cartesia") && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar voz…"
              style={{ flex: 1, minWidth: 160, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)" }}
            />
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value as "male" | "all")}
              style={{ borderRadius: 8, border: "1px solid var(--border)", padding: "8px 10px" }}
            >
              <option value="male">Masculinas</option>
              <option value="all">Todas</option>
            </select>
          </div>
          {tab === "cartesia" && (
            <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 0 }}>
              Emoções em beta no Cartesia; oficialmente garantidas só em inglês. Teste antes.
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {remote.map((v) =>
              renderCard({
                key: `${v.provider}-${v.id}`,
                title: v.name,
                subtitle: [v.accent, v.age, v.description].filter(Boolean).join(" · "),
                profile: remoteToProfile(v, language, localSpeed || 0.9),
                previewUrl: v.previewUrl,
              })
            )}
          </div>
          {loadingRemote && <p style={{ fontSize: 12, color: "var(--text-dim)" }}>Carregando…</p>}
          {hasMore && !loadingRemote && (
            <button
              type="button"
              onClick={() =>
                tab === "elevenlabs"
                  ? loadRemote({ append: true, page: page + 1 })
                  : loadRemote({ append: true, startingAfter })
              }
              style={{ ...previewBtnStyle, marginTop: 10 }}
            >
              Carregar mais
            </button>
          )}
        </div>
      )}

      {tab === "local" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {localVoices.map((v) =>
            renderCard({
              key: `l-${v.id}`,
              title: v.name,
              subtitle: v.description,
              profile: catalogToProfile(v, localSpeed || v.recommendedSpeed),
            })
          )}
        </div>
      )}

      <label style={labelStyle}>
        Velocidade ({localSpeed.toFixed(2)}x)
        {profile.provider === "heygen" ? " — template HeyGen" : ""}
      </label>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step="0.01"
        value={localSpeed}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLocalSpeed(v);
          onChange({ ...profile, speed: v });
        }}
        style={{ width: "100%" }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        {profile.provider !== "heygen" && (
          <button type="button" onClick={handlePaidTest} disabled={testing} style={previewBtnStyle}>
            {testing ? "Gerando..." : "▶ Testar voz com meu texto"}
          </button>
        )}
        <audio ref={audioRef} controls style={{ height: 32 }} />
      </div>
      {error && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

const badgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "2px 6px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  color: "var(--text-dim)",
};

const previewBtnStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
  marginTop: 8,
};
