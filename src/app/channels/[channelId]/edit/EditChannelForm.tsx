"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Channel, VoiceProfile } from "../../../../core/types";
import { catalogForProvider } from "../../../../core/providers/tts/performanceTagCatalog";
import {
  JUAN_CARLOS_HEYGEN,
  profileFromLegacyVoice,
} from "../../../../core/providers/tts/voiceCapabilities";
import { findVoice } from "../../../../core/providers/tts/voiceCatalog";
import {
  charsForDuration,
  DEFAULT_CHARS_PER_WORD,
  DEFAULT_WORDS_PER_MINUTE,
  formatBudgetLabel,
  minutesForWords,
  wordsForDuration,
} from "../../../../core/scriptBudget";
import { VoicePicker } from "./VoicePicker";

function initialVoiceProfile(channel: Channel): VoiceProfile {
  if (channel.dna.voice.profile) return channel.dna.voice.profile;
  const catalog = channel.dna.voice.voiceId
    ? findVoice(channel.dna.voice.provider as any, channel.dna.voice.voiceId)
    : undefined;
  return profileFromLegacyVoice({
    provider: channel.dna.voice.provider,
    voiceId: channel.dna.voice.voiceId,
    voiceName: catalog?.name,
    speed: channel.dna.voice.speed,
    language: channel.dna.language,
  });
}

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
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
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
  const [wordsPerMinute, setWordsPerMinute] = useState(
    channel.dna.scriptRules.wordsPerMinute ?? DEFAULT_WORDS_PER_MINUTE
  );
  const [charsPerWord, setCharsPerWord] = useState(
    channel.dna.scriptRules.charsPerWord ?? DEFAULT_CHARS_PER_WORD
  );
  const [targetWordsInput, setTargetWordsInput] = useState(
    String(wordsForDuration(channel.dna.scriptRules.defaultDurationMinutes, channel.dna.scriptRules.wordsPerMinute ?? DEFAULT_WORDS_PER_MINUTE))
  );
  const [performanceEnabled, setPerformanceEnabled] = useState(
    channel.dna.scriptRules.performanceTags?.enabled ?? false
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(
    channel.dna.scriptRules.performanceTags?.selected ?? []
  );
  const [tagsPerThousandWords, setTagsPerThousandWords] = useState(
    channel.dna.scriptRules.performanceTags?.tagsPerThousandWords ?? 35
  );
  const [customTag, setCustomTag] = useState("");
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>(() => initialVoiceProfile(channel));

  const tagCatalog = useMemo(() => catalogForProvider(voiceProfile.provider as any), [voiceProfile.provider]);
  const catalogMarkups = useMemo(() => tagCatalog.map((t) => t.markup), [tagCatalog]);

  function densityLabel(n: number): string {
    if (n <= 22) return "pouco";
    if (n <= 40) return "médio";
    return "muito";
  }

  function applyVoiceProfile(next: VoiceProfile) {
    setVoiceProfile(next);
    // Keep performance-tag checklist aligned with what this voice accepts.
    if (next.capabilities.emotion_tags && next.capabilities.allowed_tags.length) {
      setPerformanceEnabled(true);
      setSelectedTags(next.capabilities.allowed_tags);
    } else {
      setPerformanceEnabled(false);
      setSelectedTags([]);
    }
  }
  const budgetLabel = formatBudgetLabel({
    durationMinutes: defaultDurationMinutes,
    wordsPerMinute,
    charsPerWord,
  });

  function applyDurationMinutes(nextMinutes: number) {
    const minutes = Number.isFinite(nextMinutes) && nextMinutes > 0 ? nextMinutes : 0;
    setDefaultDurationMinutes(minutes);
    setTargetWordsInput(String(wordsForDuration(minutes, wordsPerMinute)));
  }

  function applyWordsPerMinute(nextWpm: number) {
    const wpm = Number.isFinite(nextWpm) && nextWpm > 0 ? nextWpm : DEFAULT_WORDS_PER_MINUTE;
    setWordsPerMinute(wpm);
    setTargetWordsInput(String(wordsForDuration(defaultDurationMinutes, wpm)));
  }

  function applyTargetWords(raw: string) {
    setTargetWordsInput(raw);
    const words = Number(raw);
    if (!(words > 0)) return;
    const minutes = minutesForWords(words, wordsPerMinute);
    if (minutes > 0) setDefaultDurationMinutes(minutes);
  }

  function toggleTag(markup: string) {
    setSelectedTags((prev) => (prev.includes(markup) ? prev.filter((t) => t !== markup) : [...prev, markup]));
  }

  function addCustomTag() {
    const trimmed = customTag.trim();
    if (!trimmed) return;
    const markup = trimmed.startsWith("[") ? trimmed : `[${trimmed.replace(/^\[|\]$/g, "")}]`;
    if (!selectedTags.includes(markup)) setSelectedTags((prev) => [...prev, markup]);
    setCustomTag("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      const response = await fetch(`/api/channels/${channel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          niche,
          dna: {
            ...channel.dna,
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
              wordsPerMinute,
              charsPerWord,
              performanceTags: {
                enabled: performanceEnabled,
                selected: selectedTags,
                tagsPerThousandWords,
              },
            },
            voice: {
              provider: voiceProfile.provider,
              voiceId: voiceProfile.voice_id,
              speed: voiceProfile.speed,
              volume: channel.dna.voice.volume ?? 1,
              profile: voiceProfile,
            },
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? `Falha ao salvar (HTTP ${response.status})`);
      }

      const voiceLabel =
        voiceProfile.provider === "heygen"
          ? `${voiceProfile.voice_name} · HeyGen (ElevenLabs v3)`
          : `${voiceProfile.voice_name} · ${voiceProfile.provider}`;
      const tagsLabel = performanceEnabled
        ? ` · ${selectedTags.length} tags de emoção ativas`
        : " · sem tags de emoção";
      setSaveMessage(`Salvo com sucesso: ${voiceLabel}${tagsLabel}.`);
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
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
      <p style={{ color: "var(--text-dim)", fontSize: 14, marginBottom: 12 }}>
        Permanent channel settings. These constrain every future generation.
      </p>

      <div
        style={{
          marginBottom: 16,
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid #b7e4c7",
          background: "#edf7f0",
          fontSize: 13,
          lineHeight: 1.45,
        }}
      >
        <strong style={{ color: "#1a7f37" }}>Voz salva no canal:</strong>{" "}
        {channel.dna.voice.profile?.voice_name ?? channel.dna.voice.provider}
        {channel.dna.voice.profile?.provider === "heygen"
          ? " · HeyGen (ElevenLabs v3) · tags de emoção ativas"
          : ` · ${channel.dna.voice.provider}`}
        {channel.dna.scriptRules.performanceTags?.enabled
          ? ` · ${channel.dna.scriptRules.performanceTags.selected?.length ?? 0} tags`
          : ""}
      </div>

      {saveMessage && (
        <div
          role="status"
          style={{
            marginBottom: 14,
            padding: "12px 14px",
            borderRadius: 12,
            background: "#1a7f37",
            color: "#fff",
            fontSize: 13,
            fontWeight: 650,
          }}
        >
          {saveMessage}
          <div style={{ marginTop: 8 }}>
            <Link href={`/channels/${channel.id}`} style={{ color: "#fff", textDecoration: "underline" }}>
              Voltar ao canal →
            </Link>
          </div>
        </div>
      )}
      {saveError && (
        <div
          role="alert"
          style={{
            marginBottom: 14,
            padding: "12px 14px",
            borderRadius: 12,
            background: "#fbeceb",
            color: "var(--danger)",
            fontSize: 13,
          }}
        >
          {saveError}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <p style={{ color: "var(--text-dim)", marginBottom: 24 }}>
          Idioma e template visual são fixos após a criação (evita quebrar o histórico do canal).
        </p>

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

          <label style={labelStyle}>Duração padrão</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Minutos</span>
              <input
                type="number"
                min={1}
                step={0.5}
                style={inputStyle}
                value={defaultDurationMinutes}
                onChange={(e) => applyDurationMinutes(Number(e.target.value))}
              />
            </div>
            <div>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Palavras alvo</span>
              <input
                type="number"
                min={50}
                step={1}
                style={inputStyle}
                value={targetWordsInput}
                onChange={(e) => applyTargetWords(e.target.value)}
              />
            </div>
          </div>
          <p style={{ fontSize: 13, color: "var(--text)", marginTop: 10, marginBottom: 0, fontWeight: 600 }}>
            {budgetLabel}
          </p>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4, marginBottom: 0, lineHeight: 1.4 }}>
            Ex.: ~1.000 palavras ≈ 8 min a 125 ppm; voz mais lenta (Amor Amor) ≈ 145 ppm → ~1.600 palavras em 11 min.
            Depende do motor e da velocidade da voz.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
            <div>
              <label style={{ ...labelStyle, marginTop: 0 }}>Palavras / minuto (WPM)</label>
              <input
                type="number"
                min={80}
                max={220}
                style={inputStyle}
                value={wordsPerMinute}
                onChange={(e) => applyWordsPerMinute(Number(e.target.value))}
              />
            </div>
            <div>
              <label style={{ ...labelStyle, marginTop: 0 }}>Chars / palavra</label>
              <input
                type="number"
                min={4}
                max={10}
                step={0.5}
                style={inputStyle}
                value={charsPerWord}
                onChange={(e) => setCharsPerWord(Number(e.target.value) || DEFAULT_CHARS_PER_WORD)}
              />
            </div>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>
            Agora: {wordsForDuration(defaultDurationMinutes, wordsPerMinute).toLocaleString("pt-BR")} palavras ·{" "}
            {charsForDuration(defaultDurationMinutes, wordsPerMinute, charsPerWord).toLocaleString("pt-BR")} caracteres totais
            (o áudio é gerado em vários pedidos TTS — ~4.800 chars/pedido no máx., não um único envio).
          </p>
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

        {channel.dna.usesScript && (
          <section style={sectionStyle}>
            <strong>COMANDOS DE INTERPRETAÇÃO</strong>
            <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8, lineHeight: 1.45 }}>
              Tags de emocionalidade e pausa no roteiro (ex. <code>[whisper]</code>, <code>[pause]</code>).
              Só marque o que faz sentido para o motor de voz — se o motor não interpreta, o áudio
              remove a tag para não ler em voz alta.
            </p>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 12,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={performanceEnabled}
                onChange={(e) => setPerformanceEnabled(e.target.checked)}
              />
              Usar comandos no roteiro gerado
            </label>

            {performanceEnabled && (
              <>
                <div
                  style={{
                    marginTop: 14,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "color-mix(in srgb, var(--surface) 80%, #f3f4f6)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                    <strong style={{ fontSize: 13 }}>Densidade de comandos</strong>
                    <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                      ~{tagsPerThousandWords}/1.000 palavras ({densityLabel(tagsPerThousandWords)})
                    </span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={55}
                    step={5}
                    value={tagsPerThousandWords}
                    onChange={(e) => setTagsPerThousandWords(Number(e.target.value))}
                    style={{ width: "100%", marginTop: 10 }}
                    aria-label="Densidade de tags por mil palavras"
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 11,
                      color: "var(--text-dim)",
                      marginTop: 2,
                    }}
                  >
                    <span>pouco (~20)</span>
                    <span>médio (~35)</span>
                    <span>muito (~50)</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "8px 0 0", lineHeight: 1.4 }}>
                    Em ~1.600 palavras: cerca de {Math.round((1600 * tagsPerThousandWords) / 1000)} tags no roteiro.
                  </p>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setSelectedTags([...catalogMarkups])}
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      borderRadius: 8,
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Selecionar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTags([])}
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      borderRadius: 8,
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Limpar
                  </button>
                </div>

                <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                  {tagCatalog.map((tag) => {
                    const checked = selectedTags.includes(tag.markup);
                    return (
                      <label
                        key={tag.markup}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
                          background: checked ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTag(tag.markup)}
                          style={{ marginTop: 3 }}
                        />
                        <span>
                          <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }}>{tag.markup}</span>
                          <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
                            {tag.label} — {tag.hint}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                  {selectedTags
                    .filter((t) => !tagCatalog.some((c) => c.markup === t))
                    .map((markup) => (
                      <label
                        key={markup}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid var(--accent)",
                          cursor: "pointer",
                        }}
                      >
                        <input type="checkbox" checked onChange={() => toggleTag(markup)} style={{ marginTop: 3 }} />
                        <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }}>{markup}</span>
                      </label>
                    ))}
                </div>
                <label style={labelStyle}>Colar tag custom</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    style={inputStyle}
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    placeholder='ex. [softly sigh] ou softly sigh'
                  />
                  <button
                    type="button"
                    onClick={addCustomTag}
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      borderRadius: 8,
                      padding: "8px 14px",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                    }}
                  >
                    Adicionar
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {channel.dna.usesNarration && (
          <section style={sectionStyle}>
            <strong>ÁUDIO</strong>
            <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "8px 0 12px", lineHeight: 1.4 }}>
              Seleção atual neste formulário:{" "}
              <strong style={{ color: "var(--text)" }}>
                {voiceProfile.voice_name}
                {voiceProfile.provider === "heygen" ? " · HeyGen / ElevenLabs v3" : ` · ${voiceProfile.provider}`}
              </strong>
              {performanceEnabled ? ` · ${selectedTags.length} tags de emoção` : ""}
              . Clique em <strong>Salvar alterações</strong> para gravar no canal.
            </p>
            <VoicePicker language={channel.dna.language} profile={voiceProfile} onChange={applyVoiceProfile} />
            {voiceProfile.provider === "heygen" && voiceProfile.heygen_template_id === JUAN_CARLOS_HEYGEN.heygen_template_id && (
              <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 10, lineHeight: 1.4 }}>
                Juan Carlos: vídeo via <code>generate_from_template</code> (texto_oracion_1..4), sem voice_id.
                Confirme cada peça antes de gastar crédito de vídeo.
              </p>
            )}
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
        {saveMessage && (
          <p style={{ marginTop: 12, fontSize: 13, color: "#1a7f37", fontWeight: 650 }}>{saveMessage}</p>
        )}
      </form>
    </div>
  );
}
