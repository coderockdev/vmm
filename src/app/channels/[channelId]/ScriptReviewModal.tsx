"use client";

import React, { useEffect, useRef, useState } from "react";
import { Channel, Script, VideoProject } from "../../../core/types";
import { PlayIcon } from "../../icons";
import { ProjectCostLabel } from "./ProjectCostLabel";

type AiOverride = "" | "mock" | "anthropic" | "openai" | "gemini";
type TtsOverride = "" | "local" | "cartesia" | "elevenlabs";

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
  const [script, setScript] = useState<Script | null>(null);
  const [currentProject, setCurrentProject] = useState(project);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ttsOverride, setTtsOverride] = useState<TtsOverride>("");
  const [approving, setApproving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const [regenAiOverride, setRegenAiOverride] = useState<AiOverride>("");
  const [regenerating, setRegenerating] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setCurrentProject(project);
    void loadScript();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function loadScript() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/videos/${project.id}`);
      const data = await response.json();
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
    try {
      const provider = ttsOverride || channel.dna.voice.provider;
      const voiceId = ttsOverride && ttsOverride !== channel.dna.voice.provider ? null : channel.dna.voice.voiceId;
      const response = await fetch("/api/voices/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          voiceId,
          text: "Olá! Esta é uma amostra da narração deste canal.",
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
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    setError(null);
    try {
      const response = await fetch(`/api/videos/${project.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttsProviderOverride: ttsOverride || null }),
      });
      const data = await response.json();
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
      const data = await response.json();
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

  const fullText = (script?.lines ?? []).map((l) => l.text).join(" ");
  const wordCount = fullText.trim() ? fullText.trim().split(/\s+/).filter(Boolean).length : 0;
  const charCount = fullText.length;
  const busy = approving || regenerating || deleting;

  return (
    <div className="script-review-overlay" role="dialog" aria-modal="true" aria-label={`Revisar roteiro: ${project.title}`}>
      <div className="script-review-modal">
        <header className="script-review-header">
          <div>
            <h2>{project.title}</h2>
            <p>{project.topic} · {project.durationMinutes} min · {project.format}</p>
            <ProjectCostLabel project={currentProject} />
          </div>
          <button type="button" className="script-review-close" onClick={onClose} aria-label="Fechar" disabled={busy}>×</button>
        </header>

        <div className="script-review-body">
          {loading && <p className="script-review-loading">Carregando roteiro...</p>}
          {!loading && !script && <p className="script-review-loading">Roteiro não encontrado.</p>}
          {!loading && script && paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph.join(" ")}</p>
          ))}
        </div>

        {!loading && script && (
          <div className="script-review-stats" aria-live="polite">
            <span>{wordCount.toLocaleString("pt-BR")} palavras</span>
            <span aria-hidden>·</span>
            <span>{charCount.toLocaleString("pt-BR")} caracteres</span>
          </div>
        )}

        {error && <div className="script-review-error">{error}</div>}

        <footer className="script-review-footer">
          <div className="script-review-action-group">
            <span className="script-review-action-label">Regenerar roteiro</span>
            <select value={regenAiOverride} onChange={(event) => setRegenAiOverride(event.target.value as AiOverride)} disabled={busy}>
              <option value="">Padrão do sistema</option>
              <option value="mock">Mock</option>
              <option value="anthropic">Claude</option>
              <option value="openai">ChatGPT</option>
              <option value="gemini">Gemini</option>
            </select>
            <button type="button" onClick={handleRegenerate} disabled={busy || loading}>
              {regenerating ? "Gerando..." : "Regenerar"}
            </button>
          </div>

          <div className="script-review-action-group">
            <span className="script-review-action-label">Voz para o áudio</span>
            <select value={ttsOverride} onChange={(event) => setTtsOverride(event.target.value as TtsOverride)} disabled={busy}>
              <option value="">Padrão do canal</option>
              <option value="local">Voz local</option>
              <option value="cartesia">Cartesia</option>
              <option value="elevenlabs">ElevenLabs</option>
            </select>
            <button type="button" className="voice-preview" aria-label="Testar voz" onClick={handlePreviewVoice} disabled={busy || previewing}>
              <PlayIcon size={16} />
            </button>
            <audio ref={previewAudioRef} style={{ display: "none" }} />
            <button type="button" className="script-review-approve" onClick={handleApprove} disabled={busy || loading || !script}>
              {approving ? "Aprovando..." : "Aprovar e gerar áudio"}
            </button>
          </div>

          <button type="button" className="script-review-delete" onClick={handleDelete} disabled={busy}>
            {deleting ? "Excluindo..." : "Excluir"}
          </button>
        </footer>
      </div>
    </div>
  );
}
