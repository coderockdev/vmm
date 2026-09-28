"use client";

import React, { useState } from "react";
import Link from "next/link";
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

export function EditChannelForm({
  channel,
  initialCoverUrl,
}: {
  channel: Channel;
  initialCoverUrl: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [coverUrl, setCoverUrl] = useState(initialCoverUrl);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  async function handleGenerateCover() {
    setGeneratingCover(true);
    setCoverError(null);
    try {
      const res = await fetch(`/api/channels/${channel.id}/cover`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao gerar capa");
      setCoverUrl(data.coverUrl);
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingCover(false);
    }
  }

  const [name, setName] = useState(channel.name);
  const [niche, setNiche] = useState(channel.niche);
  const [description, setDescription] = useState(channel.dna.description);
  const [purpose, setPurpose] = useState(channel.dna.purpose);
  const [audience, setAudience] = useState(channel.dna.audience);
  const [tone, setTone] = useState(channel.dna.tone.join(", "));
  const [topics, setTopics] = useState(channel.dna.topics.join(", "));
  const [avoid, setAvoid] = useState(channel.dna.avoid.join(", "));
  const [structure, setStructure] = useState(channel.dna.scriptRules.structure);
  const [generationPrompt, setGenerationPrompt] = useState(
    channel.dna.scriptRules.generationPrompt ?? ""
  );
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
            scriptRules: {
              ...channel.dna.scriptRules,
              structure,
              generationPrompt,
              defaultDurationMinutes,
            },
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
      <Link
        href={`/channels/${channel.id}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-dim)",
          marginBottom: 16,
        }}
      >
        ← Voltar para {channel.name}
      </Link>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>Editar Channel DNA</h1>
      <p style={{ color: "var(--text-dim)", marginBottom: 24 }}>
        Idioma e template visual são fixos após a criação (evita quebrar o histórico do canal).
      </p>

      <form onSubmit={handleSubmit}>
        <section style={sectionStyle}>
          <strong>IDENTIDADE</strong>

          <label style={labelStyle}>Capa do canal</label>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 100,
                height: 100,
                borderRadius: 12,
                overflow: "hidden",
                background: `linear-gradient(135deg, ${channel.coverColor}, ${channel.coverColor}99)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 32, fontWeight: 800, color: "#ffffffcc" }}>{channel.name.charAt(0)}</span>
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={handleGenerateCover}
                disabled={generatingCover}
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: generatingCover ? "default" : "pointer",
                  opacity: generatingCover ? 0.6 : 1,
                }}
              >
                {generatingCover ? "Gerando..." : "✨ Gerar capa com IA"}
              </button>
              <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6, maxWidth: 260 }}>
                Usa a descrição, tom e temas do canal para gerar a arte automaticamente (requer OPENAI_API_KEY).
              </p>
              {coverError && <p style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>{coverError}</p>}
            </div>
          </div>

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
          <label style={labelStyle}>Estrutura padrão (resumo)</label>
          <input style={inputStyle} value={structure} onChange={(e) => setStructure(e.target.value)} />
          <label style={labelStyle}>Duração padrão (min)</label>
          <input
            type="number"
            style={inputStyle}
            value={defaultDurationMinutes}
            onChange={(e) => setDefaultDurationMinutes(Number(e.target.value))}
          />
        </section>

        {channel.dna.usesScript && (
          <section style={sectionStyle}>
            <strong>MODELO DE ROTEIRO</strong>
            <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8, marginBottom: 0, lineHeight: 1.45 }}>
              Prompt específico deste canal: beats, estilo de repetição, o que falar/evitar, ordem das
              seções. Toda geração de roteiro (Claude, ChatGPT, Gemini…) recebe este texto como regra
              obrigatória, além da duração escolhida.
            </p>
            <label style={labelStyle}>Prompt / estrutura de geração</label>
            <textarea
              style={{ ...inputStyle, minHeight: 220, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, lineHeight: 1.45 }}
              value={generationPrompt}
              onChange={(e) => setGenerationPrompt(e.target.value)}
              placeholder={`Exemplo para ${channel.name}:\n- Abertura emocional (30–45s)\n- Preparação / respiração\n- Bloco principal com afirmações variadas (não repetir o mesmo bloco)\n- Reflexão e fechamento com CTA suave\n- Idioma e tom do canal…`}
            />
          </section>
        )}

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
