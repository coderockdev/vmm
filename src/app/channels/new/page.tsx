"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

const PALETTES = ["cosmic", "night-sky", "warm-story", "rain-blue"] as const;
const LANGUAGES = [
  { value: "pt", label: "Português" },
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
] as const;

const inputStyle: React.CSSProperties = { width: "100%" };
const sectionStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 20,
  marginBottom: 16,
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "var(--text-dim)",
  marginBottom: 6,
  marginTop: 14,
};

export default function NewChannelPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [coverColor, setCoverColor] = useState("#ff5a2e");

  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState("");
  const [audience, setAudience] = useState("");
  const [language, setLanguage] = useState<"pt" | "es" | "en">("pt");
  const [tone, setTone] = useState("");
  const [topics, setTopics] = useState("");
  const [avoid, setAvoid] = useState("");
  const [structure, setStructure] = useState(
    "introdução → preparação → conteúdo principal → reflexão → encerramento"
  );
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState(8);

  const [palette, setPalette] = useState<(typeof PALETTES)[number]>("cosmic");
  const [textPreset, setTextPreset] = useState<"bold-scroll" | "none">("bold-scroll");

  const [voiceProvider, setVoiceProvider] = useState<"local" | "elevenlabs">("local");
  const [voiceSpeed, setVoiceSpeed] = useState(1);
  const [usesNarration, setUsesNarration] = useState(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          niche,
          coverColor,
          description,
          purpose,
          audience,
          language,
          tone: tone.split(",").map((s) => s.trim()).filter(Boolean),
          topics: topics.split(",").map((s) => s.trim()).filter(Boolean),
          avoid: avoid.split(",").map((s) => s.trim()).filter(Boolean),
          scriptRules: {
            opening: "criar conexão com o espectador rapidamente",
            structure,
            cta: "CTA curto e natural quando apropriado",
            defaultDurationMinutes,
            defaultSceneCount: 4,
            generationPrompt: "",
            pauses: { betweenLines: 0.5, betweenSections: 1.5 },
          },
          visual: { palette, textPreset },
          voice: { provider: voiceProvider, speed: voiceSpeed, volume: 1 },
          usesScript: true,
          usesNarration,
        }),
      });
      const data = await res.json();
      if (data.channel) router.push(`/channels/${data.channel.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>Novo Canal</h1>
      <p style={{ color: "var(--text-dim)", marginBottom: 24 }}>
        Isso vira o Channel DNA — o contexto permanente que vai governar tudo que esse canal produzir.
      </p>

      <form onSubmit={handleSubmit}>
        <section style={sectionStyle}>
          <strong>IDENTIDADE</strong>
          <label style={labelStyle}>Nome do canal</label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />

          <label style={labelStyle}>Tagline curta (aparece no card)</label>
          <input
            style={inputStyle}
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="Ex: Amor • Relacionamentos"
          />

          <label style={labelStyle}>Cor de destaque</label>
          <input
            type="color"
            value={coverColor}
            onChange={(e) => setCoverColor(e.target.value)}
            style={{ width: 60, height: 36, padding: 2 }}
          />
        </section>

        <section style={sectionStyle}>
          <strong>CONTEÚDO</strong>

          <label style={labelStyle}>Sobre o que é este canal?</label>
          <textarea
            style={{ ...inputStyle, minHeight: 60 }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <label style={labelStyle}>Objetivo — que tipo de conteúdo queremos produzir?</label>
          <textarea
            style={{ ...inputStyle, minHeight: 50 }}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />

          <label style={labelStyle}>Público</label>
          <input style={inputStyle} value={audience} onChange={(e) => setAudience(e.target.value)} />

          <label style={labelStyle}>Idioma (fixo do canal — nunca perguntado de novo na geração)</label>
          <select style={inputStyle} value={language} onChange={(e) => setLanguage(e.target.value as any)}>
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>

          <label style={labelStyle}>Tom (separado por vírgula)</label>
          <input style={inputStyle} value={tone} onChange={(e) => setTone(e.target.value)} placeholder="calmo, acolhedor" />

          <label style={labelStyle}>Temas principais (separado por vírgula)</label>
          <input style={inputStyle} value={topics} onChange={(e) => setTopics(e.target.value)} />

          <label style={labelStyle}>Assuntos a evitar (separado por vírgula)</label>
          <input style={inputStyle} value={avoid} onChange={(e) => setAvoid(e.target.value)} />

          <label style={labelStyle}>Estrutura padrão do roteiro</label>
          <input style={inputStyle} value={structure} onChange={(e) => setStructure(e.target.value)} />

          <label style={labelStyle}>Duração padrão (minutos)</label>
          <input
            type="number"
            style={inputStyle}
            value={defaultDurationMinutes}
            onChange={(e) => setDefaultDurationMinutes(Number(e.target.value))}
          />
        </section>

        <section style={sectionStyle}>
          <strong>VÍDEO</strong>
          <label style={labelStyle}>Template visual</label>
          <input style={inputStyle} value="Neon Meditation" disabled />

          <label style={labelStyle}>Paleta</label>
          <select style={inputStyle} value={palette} onChange={(e) => setPalette(e.target.value as any)}>
            {PALETTES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <label style={labelStyle}>Texto sincronizado</label>
          <select style={inputStyle} value={textPreset} onChange={(e) => setTextPreset(e.target.value as any)}>
            <option value="bold-scroll">Bold scroll (padrão)</option>
            <option value="none">Sem texto (canal ambiente)</option>
          </select>
        </section>

        <section style={sectionStyle}>
          <strong>ÁUDIO</strong>
          <label style={labelStyle}>
            <input
              type="checkbox"
              checked={usesNarration}
              onChange={(e) => setUsesNarration(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Este canal usa narração
          </label>

          {usesNarration && (
            <>
              <label style={labelStyle}>Motor de voz padrão</label>
              <select style={inputStyle} value={voiceProvider} onChange={(e) => setVoiceProvider(e.target.value as any)}>
                <option value="local">Local (macOS say)</option>
                <option value="elevenlabs">ElevenLabs</option>
              </select>

              <label style={labelStyle}>Velocidade ({voiceSpeed.toFixed(2)}x)</label>
              <input
                type="range"
                min="0.7"
                max="1.3"
                step="0.01"
                value={voiceSpeed}
                onChange={(e) => setVoiceSpeed(Number(e.target.value))}
                style={inputStyle}
              />
            </>
          )}
        </section>

        <button
          type="submit"
          disabled={saving || !name}
          style={{
            background: "var(--accent)",
            color: "#fff",
            fontWeight: 700,
            padding: "12px 24px",
            borderRadius: 10,
            border: "none",
            cursor: "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Salvando..." : "Salvar como Channel DNA"}
        </button>
      </form>
    </div>
  );
}
