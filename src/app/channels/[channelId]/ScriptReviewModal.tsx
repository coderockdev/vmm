"use client";

import React, { useEffect, useRef, useState } from "react";
import { Channel, Script, VideoProject } from "../../../core/types";
import { PlayIcon } from "../../icons";
import { ProjectCostLabel } from "./ProjectCostLabel";
import { JUAN_CARLOS_ELEVENLABS_VOICE_ID } from "../../../core/providers/tts/voiceCapabilities";

type AiOverride = "" | "mock" | "anthropic" | "openai" | "gemini";
type TtsOverride = "" | "local" | "cartesia" | "elevenlabs";

function defaultAudioVoice(channel: Channel): { provider: TtsOverride; voiceId: string } {
  // Empty provider = follow DNA. For HeyGen (Juan Carlos), the pipeline
  // maps to ElevenLabs automatically with the DNA elevenlabs_voice_id.
  return {
    provider: "",
    voiceId:
      channel.dna.voice.profile?.elevenlabs_voice_id ||
      channel.dna.voice.voiceId ||
      (channel.dna.voice.provider === "heygen" ? JUAN_CARLOS_ELEVENLABS_VOICE_ID : ""),
  };
}

export function ScriptReviewModal({
  project,
  channel,
  onClose,
  onApproved,
  onDeleted,
}: {
  project: VideoProject;
  channel: Channel;
  onClose: () => void;
  onApproved: (updatedProject: VideoProject) => void;
  onDeleted: (projectId: string) => void;
}) {
  const defaults = defaultAudioVoice(channel);
  const [script, setScript] = useState<Script | null>(null);
  const [currentProject, setCurrentProject] = useState(project);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ttsOverride, setTtsOverride] = useState<TtsOverride>(defaults.provider);
  const [ttsVoiceId, setTtsVoiceId] = useState(defaults.voiceId);
  const [elevenVoices, setElevenVoices] = useState<Array<{ id: string; name: string; accent: string; gender: string }>>([]);
  const [cartesiaVoices, setCartesiaVoices] = useState<Array<{ id: string; name: string; accent: string; gender: string }>>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const [regenAiOverride, setRegenAiOverride] = useState<AiOverride>("openai");
  const [regenerating, setRegenerating] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setCurrentProject(project);
    void loadScript();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    if (ttsOverride !== "elevenlabs") {
      setElevenVoices([]);
      setVoicesError(null);
      return;
    }
    let cancelled = false;
    setVoicesLoading(true);
    setVoicesError(null);
    void fetch("/api/voices/elevenlabs?gender=male&page=0")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Falha ao listar vozes (${res.status})`);
        if (cancelled) return;
        const voices = (data.voices ?? []) as Array<{ id: string; name: string; accent: string; gender: string }>;
        setElevenVoices(voices.filter((v) => v.id));
        if (voices[0]?.id && !ttsVoiceId) setTtsVoiceId(voices[0].id);
      })
      .catch((err) => {
        if (!cancelled) setVoicesError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setVoicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsOverride]);

  useEffect(() => {
    if (ttsOverride !== "cartesia") {
      setCartesiaVoices([]);
      return;
    }
    let cancelled = false;
    setVoicesLoading(true);
    setVoicesError(null);
    const params = new URLSearchParams({
      language: channel.dna.language,
      gender: "all",
      limit: "30",
    });
    void fetch(`/api/voices/cartesia?${params}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Falha ao listar vozes (${res.status})`);
        if (cancelled) return;
        const voices = (data.voices ?? []) as Array<{ id: string; name: string; accent: string; gender: string }>;
        setCartesiaVoices(voices.filter((v) => v.id));
      })
      .catch((err) => {
        if (!cancelled) setVoicesError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setVoicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ttsOverride, channel.dna.language]);

  async function loadScript() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/videos/${project.id}`);
      const text = await response.text();
      if (!response.ok || !text) throw new Error("Não foi possível carregar o roteiro.");
      const data = JSON.parse(text);
      setScript(data.script ?? null);
      if (data.project) setCurrentProject(data.project);
    } catch {
      setError("Não foi possível carregar o roteiro.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePreviewVoice() {
    setPreviewing(true);
    setError(null);
    try {
      const provider = ttsOverride || channel.dna.voice.provider;
      const voiceId =
        ttsVoiceId ||
        (ttsOverride && ttsOverride !== channel.dna.voice.provider ? null : channel.dna.voice.voiceId);
      if (provider === "elevenlabs" && !voiceId) {
        throw new Error("Escolha uma voz masculina ElevenLabs antes de testar.");
      }
      const response = await fetch("/api/voices/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          voiceId,
          text:
            channel.dna.language === "es"
              ? "Hola. Esta es una muestra de la narración de este canal."
              : "Olá! Esta é uma amostra da narração deste canal.",
          speed: channel.dna.voice.speed,
          language: channel.dna.language,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Falha ao gerar amostra de voz");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (previewAudioRef.current) {
        previewAudioRef.current.src = url;
        await previewAudioRef.current.play();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    setError(null);
    try {
      const juanCarlosId =
        channel.dna.voice.profile?.elevenlabs_voice_id || JUAN_CARLOS_ELEVENLABS_VOICE_ID;
      const needsElevenLabsId =
        ttsOverride === "elevenlabs" ||
        (!ttsOverride && channel.dna.voice.provider === "heygen");
      // If UI shows Juan Carlos via select fallback but state is empty, still send the id.
      const resolvedVoiceId =
        ttsVoiceId.trim() || (needsElevenLabsId ? juanCarlosId : "") || null;
      const response = await fetch(`/api/videos/${project.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Empty = DNA path (HeyGen → Juan Carlos ElevenLabs automatically).
          ttsProviderOverride: ttsOverride || null,
          ttsVoiceIdOverride: resolvedVoiceId,
        }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.error ?? "Falha ao aprovar o roteiro");
      onApproved(data.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApproving(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    setError(null);
    try {
      const response = await fetch(`/api/videos/${project.id}/regenerate-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiProviderOverride: regenAiOverride || null }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.error ?? "Falha ao regenerar o roteiro");
      setScript(data.script);
      if (data.project) setCurrentProject(data.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegenerating(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/videos/${project.id}`, { method: "DELETE" });
      onDeleted(project.id);
    } finally {
      setDeleting(false);
    }
  }

  const paragraphs: string[][] = [];
  let current: string[] = [];
  for (const line of script?.lines ?? []) {
    current.push(line.text);
    if (line.sectionBreak) {
      paragraphs.push(current);
      current = [];
    }
  }
  if (current.length) paragraphs.push(current);

  const sceneStats = paragraphs.map((paragraph) => {
    const text = paragraph.join(" ");
    return {
      words: text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0,
      chars: text.length,
    };
  });

  const fullText = (script?.lines ?? []).map((l) => l.text).join(" ");
  const wordCount = fullText.trim() ? fullText.trim().split(/\s+/).filter(Boolean).length : 0;
  const charCount = fullText.length;
  const busy = approving || regenerating || deleting;
  const channelIsHeygen = channel.dna.voice.provider === "heygen";

  return (
    <div className="script-review-overlay" role="dialog" aria-modal="true" aria-label={`Revisar roteiro: ${project.title}`}>
      <div className="script-review-modal">
        <header className="script-review-header">
          <div>
            <h2>{project.title}</h2>
            <p>
              {project.topic} · {project.durationMinutes} min · {project.format}
              {paragraphs.length > 0 ? ` · ${paragraphs.length} cenas` : ""}
            </p>
            <ProjectCostLabel project={currentProject} />
          </div>
          <button type="button" className="script-review-close" onClick={onClose} aria-label="Fechar" disabled={busy}>×</button>
        </header>

        <div className="script-review-body">
          {loading && <p className="script-review-loading">Carregando roteiro...</p>}
          {!loading && !script && <p className="script-review-loading">Roteiro não encontrado.</p>}
          {!loading && script && paragraphs.map((paragraph, index) => (
            <section key={index} className="script-review-scene">
              <header className="script-review-scene-header">
                <strong>Cena {index + 1}</strong>
                <span>
                  {sceneStats[index].words.toLocaleString("pt-BR")} palavras ·{" "}
                  {sceneStats[index].chars.toLocaleString("pt-BR")} chars
                  {sceneStats[index].chars > 4800 ? " · acima do limite TTS (4800)" : ""}
                </span>
              </header>
              <p>{paragraph.join(" ")}</p>
            </section>
          ))}
        </div>

        {!loading && script && (
          <div className="script-review-stats" aria-live="polite">
            <span>{wordCount.toLocaleString("pt-BR")} palavras</span>
            <span aria-hidden>·</span>
            <span>{charCount.toLocaleString("pt-BR")} caracteres</span>
            <span aria-hidden>·</span>
            <span>{paragraphs.length} cenas</span>
          </div>
        )}

        {error && <div className="script-review-error">{error}</div>}
        {channelIsHeygen && (
          <div className="script-review-error" style={{ background: "transparent", color: "var(--text-dim)" }}>
            DNA = <strong>Juan Carlos</strong> (ElevenLabs v3 · speed 0.9 · stability 0.5 · LATAM).
            Vídeo: template HeyGen sem voice_id. Áudio deste pipeline: mesma voz ElevenLabs (
            {channel.dna.voice.profile?.elevenlabs_voice_id || JUAN_CARLOS_ELEVENLABS_VOICE_ID}).
          </div>
        )}

        <footer className="script-review-footer">
          <div className="script-review-action-group">
            <span className="script-review-action-label">Regenerar roteiro</span>
            <select value={regenAiOverride} onChange={(event) => setRegenAiOverride(event.target.value as AiOverride)} disabled={busy}>
              <option value="">ChatGPT, senão Gemini</option>
              <option value="openai">ChatGPT</option>
              <option value="gemini">Gemini</option>
            </select>
            <button type="button" onClick={handleRegenerate} disabled={busy || loading}>
              {regenerating ? "Gerando..." : "Regenerar"}
            </button>
          </div>
          <p className="script-review-hint">
            Regenerar usa o DNA do canal (modelo de oração, avoid-list, {channel.dna.scriptRules.defaultSceneCount ?? 4} cenas parelhas ≤4.800 chars)
            {channel.dna.voice.provider === "heygen" || channel.dna.voice.provider === "elevenlabs"
              ? " e tags emocionais/pausas válidas para ElevenLabs/HeyGen."
              : "."}{" "}
            Evite Mock — ele ignora o DNA.
          </p>

          <div className="script-review-action-group script-review-voice-group">
            <span className="script-review-action-label">Voz para o áudio</span>
            <select
              value={ttsOverride}
              onChange={(event) => {
                const next = event.target.value as TtsOverride;
                setTtsOverride(next);
                if (next === "elevenlabs") {
                  setTtsVoiceId(
                    channel.dna.voice.profile?.elevenlabs_voice_id ||
                      JUAN_CARLOS_ELEVENLABS_VOICE_ID
                  );
                } else if (next === "") {
                  setTtsVoiceId(
                    channel.dna.voice.profile?.elevenlabs_voice_id ||
                      channel.dna.voice.voiceId ||
                      (channelIsHeygen ? JUAN_CARLOS_ELEVENLABS_VOICE_ID : "")
                  );
                } else if (next === "cartesia") {
                  setTtsVoiceId(
                    channel.dna.voice.provider === "cartesia" ? channel.dna.voice.voiceId || "" : ""
                  );
                } else {
                  setTtsVoiceId("");
                }
              }}
              disabled={busy}
            >
              <option value="">{channelIsHeygen ? "Padrão DNA: Juan Carlos (ElevenLabs)" : "Padrão do canal"}</option>
              <option value="local">Voz local</option>
              <option value="cartesia">Cartesia</option>
              <option value="elevenlabs">ElevenLabs (outra voz)</option>
            </select>
            {ttsOverride === "cartesia" && (
              <select
                className="script-review-voice-select"
                value={ttsVoiceId}
                onChange={(event) => setTtsVoiceId(event.target.value)}
                disabled={busy || voicesLoading}
                aria-label={`Voz Cartesia em ${channel.dna.language === "pt" ? "português" : channel.dna.language === "en" ? "inglês" : "espanhol"}`}
              >
                <option value="">
                  {voicesLoading
                    ? "Carregando vozes…"
                    : `Escolhe uma voz em ${channel.dna.language === "pt" ? "português" : channel.dna.language === "en" ? "inglês" : "espanhol"}`}
                </option>
                {cartesiaVoices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.accent ? ` · ${v.accent}` : ""}
                  </option>
                ))}
              </select>
            )}
            {ttsOverride === "elevenlabs" && (
              <select
                className="script-review-voice-select"
                value={ttsVoiceId || channel.dna.voice.profile?.elevenlabs_voice_id || JUAN_CARLOS_ELEVENLABS_VOICE_ID}
                onChange={(event) => setTtsVoiceId(event.target.value)}
                disabled={busy || voicesLoading}
                aria-label="Voz masculina ElevenLabs"
              >
                <option value={channel.dna.voice.profile?.elevenlabs_voice_id || JUAN_CARLOS_ELEVENLABS_VOICE_ID}>
                  Juan Carlos (DNA)
                </option>
                {elevenVoices
                  .filter((v) => v.id !== (channel.dna.voice.profile?.elevenlabs_voice_id || JUAN_CARLOS_ELEVENLABS_VOICE_ID))
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.accent ? ` · ${v.accent}` : ""}
                    </option>
                  ))}
              </select>
            )}
            {(!ttsOverride || ttsOverride === "elevenlabs") && channelIsHeygen && (
              <span className="script-review-voice-meta">0.9x · eleven_v3</span>
            )}
            <button type="button" className="voice-preview" aria-label="Testar voz" onClick={handlePreviewVoice} disabled={busy || previewing}>
              <PlayIcon size={16} />
            </button>
            <audio ref={previewAudioRef} style={{ display: "none" }} />
          </div>
          {voicesError && <p className="script-review-voices-error">{voicesError}</p>}

          <div className="script-review-primary-row">
            <button type="button" className="script-review-delete" onClick={handleDelete} disabled={busy}>
              {deleting ? "Excluindo..." : "Excluir"}
            </button>
            <button
              type="button"
              className="script-review-approve"
              onClick={handleApprove}
              disabled={busy || loading || !script}
            >
              {approving ? "Aprovando..." : "Aprovar e gerar áudio"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
