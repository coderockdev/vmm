"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Channel } from "../../../../core/types";
import { TTSProviderName } from "../../../../core/providers/tts/TTSProvider";
import { VoicePicker } from "./VoicePicker";

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

export function EditChannelForm({ channel }: { channel: Channel }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(channel.name);
  const [niche, setNiche] = useState(channel.niche);
  const [description, setDescription] = useState(channel.dna.description);
  const [purpose, setPurpose] = useState(channel.dna.purpose);
  const [audience, setAudience] = useState(channel.dna.audience);
  const [tone, setTone] = useState(channel.dna.tone.join(", "));
  const [topics, setTopics] = useState(channel.dna.topics.join(", "));
  const [avoid, setAvoid] = useState(channel.dna.avoid.join(", "));
  const [structure, setStructure] = useState(channel.dna.scriptRules.structure);
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState(
    channel.dna.scriptRules.defaultDurationMinutes
  );
  const [voice, setVoice] = useState({
    provider: channel.dna.voice.provider as TTSProviderName,
    voiceId: channel.dna.voice.voiceId ?? "",
    speed: channel.dna.voice.speed,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(`/api/channels/${channel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          niche,
          dna: {
            description,
            purpose,
            audience,
            tone: tone.split(",").map((s) => s.trim()).filter(Boolean),
            topics: topics.split(",").map((s) => s.trim()).filter(Boolean),
            avoid: avoid.split(",").map((s) => s.trim()).filter(Boolean),
            scriptRules: { ...channel.dna.scriptRules, structure, defaultDurationMinutes },
            voice: { ...channel.dna.voice, ...voice },
          },
        }),
      });
      router.push(`/channels/${channel.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>Editar Channel DNA</h1>
      <p style={{ color: "var(--text-dim)", marginBottom: 24 }}>
        Idioma e template visual são fixos após a criação (evita quebrar o histórico do canal).
      </p>

      <form onSubmit={handleSubmit}>
        <section style={sectionStyle}>
          <strong>IDENTIDADE</strong>
          <label style={labelStyle}>Nome do canal</label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />
          <label style={labelStyle}>Tagline</label>
          <input style={inputStyle} value={niche} onChange={(e) => setNiche(e.target.value)} />
        </section>

        <section style={sectionStyle}>
          <strong>CONTEÚDO</strong>
          <label style={labelStyle}>Descrição</label>
          <textarea style={{ ...inputStyle, minHeight: 60 }} value={description} onChange={(e) => setDescription(e.target.value)} />
          <label style={labelStyle}>Objetivo</label>
          <textarea style={{ ...inputStyle, minHeight: 50 }} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          <label style={labelStyle}>Público</label>
          <input style={inputStyle} value={audience} onChange={(e) => setAudience(e.target.value)} />
          <label style={labelStyle}>Tom</label>
          <input style={inputStyle} value={tone} onChange={(e) => setTone(e.target.value)} />
          <label style={labelStyle}>Temas principais</label>
          <input style={inputStyle} value={topics} onChange={(e) => setTopics(e.target.value)} />
          <label style={labelStyle}>Assuntos a evitar</label>
          <input style={inputStyle} value={avoid} onChange={(e) => setAvoid(e.target.value)} />
          <label style={labelStyle}>Estrutura padrão</label>
          <input style={inputStyle} value={structure} onChange={(e) => setStructure(e.target.value)} />
          <label style={labelStyle}>Duração padrão (min)</label>
          <input
            type="number"
            style={inputStyle}
            value={defaultDurationMinutes}
            onChange={(e) => setDefaultDurationMinutes(Number(e.target.value))}
          />
        </section>

        {channel.dna.usesNarration && (
          <section style={sectionStyle}>
            <strong>ÁUDIO</strong>
            <VoicePicker
              language={channel.dna.language}
              provider={voice.provider}
              voiceId={voice.voiceId}
              speed={voice.speed}
              onChange={(next) => setVoice(next)}
            />
          </section>
        )}

        <button
          type="submit"
          disabled={saving}
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
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>
      </form>
    </div>
  );
}
