"use client";

import React, { useEffect, useState } from "react";
import { VideoProject } from "../../../core/types";
import { MUSIC_STYLE_OPTIONS } from "../../../core/providers/music/musicalDna";
import { STYLE_PRESETS } from "../../../core/videoRenderers/presets";
import { mediaUrl } from "../../../core/media";

type LibEntry = {
  id: string;
  name: string;
  file: string;
  type: string;
  mood: string[];
  attributionRequired: boolean;
};

export function AudioBedControls({
  channelId,
  project,
  onUpdated,
}: {
  channelId: string;
  project: VideoProject;
  onUpdated: (p: VideoProject) => void;
}) {
  const [busy, setBusy] = useState<"music" | "sfx" | "mix" | "video" | "preview" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [musicStyle, setMusicStyle] = useState(project.musicStyle || "romantico-cinematico");
  const [entries, setEntries] = useState<LibEntry[]>([]);
  const [videoStyle, setVideoStyle] = useState("scrolling-text");
  const [presetId, setPresetId] = useState("amor-amor");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/videos/${project.id}/audio-bed?type=music`)
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []))
      .catch(() => undefined);
  }, [project.id]);

  async function runBed(body: Record<string, unknown>, kind: typeof busy) {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${project.id}/audio-bed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha na trilha/SFX");
      if (data.project) onUpdated(data.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function runVideo(preview: boolean) {
    setBusy(preview ? "preview" : "video");
    setError(null);
    try {
      const res = await fetch(`/api/videos/${project.id}/render-style`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          styleId: videoStyle,
          presetId,
          preview,
          previewSeconds: 12,
          aspectRatio: "9:16",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha no render");
      if (data.url) setPreviewUrl(data.url);
      if (data.project) onUpdated(data.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const mixUrl = project.mixAudioRef ? mediaUrl(channelId, project.mixAudioRef) : null;
  const musicUrl = project.musicRef ? mediaUrl(channelId, project.musicRef) : null;

  return (
    <div className="audio-bed-controls">
      {error && <p className="generation-error">{error}</p>}

      <div className="audio-bed-block">
        <h4>Música de fundo</h4>
        <p className="portadas-actions-hint">
          Biblioteca interna (YouTube Audio Library). 100% instrumental · zero custo por vídeo.
        </p>
        <label className="portadas-label">
          Estilo musical
          <select value={musicStyle} onChange={(e) => setMusicStyle(e.target.value)}>
            {MUSIC_STYLE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="portadas-actions">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void runBed({ musicOnly: true, style: musicStyle }, "music")}
          >
            {busy === "music" ? "A escolher…" : project.musicRef ? "Regenerar música" : "Gerar música"}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void runBed({ musicOff: true, sfxOnly: false }, "music")}
          >
            Sem música
          </button>
        </div>
        {musicUrl && (
          <audio className="review-queue-audio" controls preload="metadata" src={musicUrl} />
        )}
        {entries.length > 0 && (
          <p className="portadas-actions-hint">{entries.length} faixas na biblioteca (sem atribuição preferidas).</p>
        )}
      </div>

      <div className="audio-bed-block">
        <h4>Efeitos sonoros</h4>
        <p className="portadas-actions-hint">
          Poucos e só onde o roteiro pede (telefone, vento…). Nunca no texto do vídeo.
        </p>
        <div className="portadas-actions">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void runBed({ sfxOnly: true }, "sfx")}
          >
            {busy === "sfx" ? "A planear…" : "Gerar SFX"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => void runBed({ sfxOff: true }, "sfx")}>
            Sem SFX
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void runBed({ style: musicStyle }, "mix")}
          >
            {busy === "mix" ? "A misturar…" : "Voz + música + SFX"}
          </button>
        </div>
        {project.productionMarkers && project.productionMarkers.length > 0 && (
          <p className="portadas-actions-hint">Marcadores: {project.productionMarkers.join(" · ")}</p>
        )}
        {mixUrl && (
          <>
            <p className="portadas-actions-hint">Mix completo (voz + trilha + SFX)</p>
            <audio className="review-queue-audio" controls preload="metadata" src={mixUrl} />
          </>
        )}
      </div>

      <div className="audio-bed-block">
        <h4>Estilo visual do vídeo</h4>
        <label className="portadas-label">
          Estilo
          <select value={videoStyle} onChange={(e) => setVideoStyle(e.target.value)}>
            <option value="scrolling-text">Texto rolando contínuo</option>
            <option value="cinematic-text">Texto + fundo cinematográfico</option>
            <option value="minimalist">Texto minimalista</option>
            <option value="highlighted-scroll" disabled>
              4 linhas + destaque (em breve)
            </option>
          </select>
        </label>
        <label className="portadas-label">
          Preset
          <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
            {STYLE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <div className="portadas-actions">
          <button type="button" disabled={!!busy} onClick={() => void runVideo(true)}>
            {busy === "preview" ? "Preview…" : "Preview 12s"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => void runVideo(false)}>
            {busy === "video" ? "A renderizar…" : "Gerar vídeo"}
          </button>
        </div>
        {previewUrl && (
          <video className="audio-bed-preview" controls src={previewUrl} playsInline />
        )}
      </div>
    </div>
  );
}
