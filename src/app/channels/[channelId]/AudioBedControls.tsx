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

type BedBusy = "music" | "sfx" | "mix" | "video" | "preview" | null;

const BUSY_LABEL: Record<Exclude<BedBusy, null>, string> = {
  music: "A gerar música…",
  sfx: "A gerar SFX…",
  mix: "A remisturar áudio…",
  video: "A renderizar vídeo…",
  preview: "A gerar preview…",
};

function clampPct(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function AudioBedControls({
  channelId,
  project,
  voiceUrl,
  onUpdated,
  onBusyChange,
}: {
  channelId: string;
  project: VideoProject;
  /** Original narration (voice only). */
  voiceUrl: string | null;
  onUpdated: (p: VideoProject) => void;
  /** Surfaces busy state to the parent card. */
  onBusyChange?: (label: string | null) => void;
}) {
  const [busy, setBusy] = useState<BedBusy>(null);
  const [error, setError] = useState<string | null>(null);
  const [flashOk, setFlashOk] = useState<string | null>(null);
  const [musicStyle, setMusicStyle] = useState(project.musicStyle || "romantico-cinematico");
  const [entries, setEntries] = useState<LibEntry[]>([]);
  const [videoStyle, setVideoStyle] = useState("scrolling-text");
  const [presetId, setPresetId] = useState("amor-amor");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [musicPct, setMusicPct] = useState(
    clampPct((project.musicVolume ?? 0.12) * 100, 12)
  );
  const [sfxPct, setSfxPct] = useState(clampPct((project.sfxVolume ?? 0.5) * 100, 50));

  const onBusyChangeRef = React.useRef(onBusyChange);
  onBusyChangeRef.current = onBusyChange;

  useEffect(() => {
    onBusyChangeRef.current?.(busy ? BUSY_LABEL[busy] : null);
  }, [busy]);

  useEffect(() => {
    return () => onBusyChangeRef.current?.(null);
  }, []);

  useEffect(() => {
    void fetch(`/api/videos/${project.id}/audio-bed?type=music`)
      .then((r) => r.json())
      .then((d) => {
        setEntries(d.entries ?? []);
        if (d.project?.id === project.id) {
          const hydrated = d.project as VideoProject;
          if (
            hydrated.mixMusicRef !== project.mixMusicRef ||
            hydrated.mixSfxRef !== project.mixSfxRef ||
            hydrated.mixAudioRef !== project.mixAudioRef ||
            hydrated.musicTrackName !== project.musicTrackName ||
            JSON.stringify(hydrated.sfxCues) !== JSON.stringify(project.sfxCues)
          ) {
            onUpdated(hydrated);
          }
        }
        const musical = d.musical as { volume?: number; sfxVolume?: number } | null;
        if (typeof project.musicVolume !== "number" && typeof musical?.volume === "number") {
          setMusicPct(clampPct(musical.volume * 100, 8));
        }
        if (typeof project.sfxVolume !== "number" && typeof musical?.sfxVolume === "number") {
          setSfxPct(clampPct(musical.sfxVolume * 100, 50));
        }
      })
      .catch(() => undefined);
    // Intentionally only re-fetch when project id changes — onUpdated would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    if (typeof project.musicVolume === "number") {
      setMusicPct(clampPct(project.musicVolume * 100, 8));
    }
    if (typeof project.sfxVolume === "number") {
      setSfxPct(clampPct(project.sfxVolume * 100, 50));
    }
  }, [project.musicVolume, project.sfxVolume]);

  function volumes() {
    return {
      musicVolume: Math.min(1, Math.max(0, musicPct / 100)),
      sfxVolume: Math.min(1, Math.max(0, sfxPct / 100)),
    };
  }

  async function runBed(body: Record<string, unknown>, kind: BedBusy) {
    if (!kind) return;
    setBusy(kind);
    setError(null);
    setFlashOk(null);
    try {
      const res = await fetch(`/api/videos/${project.id}/audio-bed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...volumes(), ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha na trilha/SFX");
      if (data.project) onUpdated(data.project);
      const ok =
        kind === "music"
          ? body.musicOff
            ? "Música removida"
            : "Música gerada — ouve as versões acima"
          : kind === "sfx"
            ? body.sfxOff
              ? "SFX removidos"
              : "SFX gerados — ouve as versões acima"
            : "Mix atualizado — ouve as versões acima";
      setFlashOk(ok);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function runVideo(preview: boolean) {
    setBusy(preview ? "preview" : "video");
    setError(null);
    setFlashOk(null);
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
      setFlashOk(preview ? "Preview pronto" : "Vídeo gerado");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const mixMusicUrl = project.mixMusicRef ? mediaUrl(channelId, project.mixMusicRef) : null;
  const mixSfxUrl = project.mixSfxRef ? mediaUrl(channelId, project.mixSfxRef) : null;
  const mixFullUrl = project.mixAudioRef ? mediaUrl(channelId, project.mixAudioRef) : null;
  const hasBed = Boolean(project.musicRef || project.sfxRef);
  const musicReady = Boolean(project.mixMusicRef);
  const sfxReady = Boolean(project.mixSfxRef);
  const fullReady = Boolean(project.mixAudioRef);

  return (
    <div className={`audio-bed-controls${busy ? " is-busy" : ""}`}>
      {busy && (
        <p className="audio-bed-banner is-working" role="status" aria-live="polite">
          <span className="audio-bed-spinner" />
          {BUSY_LABEL[busy]}
        </p>
      )}
      {flashOk && !busy && (
        <p className="audio-bed-banner is-ok" role="status">
          {flashOk}
        </p>
      )}
      {error && <p className="generation-error">{error}</p>}

      <div className="audio-bed-block audio-bed-block-listen">
        <h4>Ouvir versões</h4>
        <p className="portadas-actions-hint">
          1 = só voz · 2 = voz+música (mesmo tema em loop) · 3 = voz+SFX · 4 = tudo
        </p>
        <div className="audio-bed-chips">
          <StatusChip
            label="Voz"
            state={voiceUrl ? "ready" : "idle"}
            busy={false}
          />
          <StatusChip
            label="Música"
            state={musicReady ? "ready" : "idle"}
            busy={busy === "music" || busy === "mix"}
          />
          <StatusChip
            label="SFX"
            state={sfxReady ? "ready" : "idle"}
            busy={busy === "sfx" || busy === "mix"}
          />
          <StatusChip
            label="Mix completo"
            state={fullReady ? "ready" : "idle"}
            busy={busy === "music" || busy === "sfx" || busy === "mix"}
          />
        </div>
        {(project.musicTrackName || (project.sfxCues && project.sfxCues.length > 0) || (project.productionMarkers && project.productionMarkers.length > 0)) && (
          <div className="audio-bed-summary">
            {project.musicTrackName && (
              <p>
                <strong>Música (loop):</strong> {project.musicTrackName}
                {project.musicStyle ? ` · estilo ${project.musicStyle}` : ""}
                {typeof project.musicVolume === "number"
                  ? ` · ${Math.round(project.musicVolume * 100)}%`
                  : ""}
              </p>
            )}
            {(project.sfxCues?.length || project.productionMarkers?.length) ? (
              <div>
                <p>
                  <strong>SFX aplicados</strong>
                  {typeof project.sfxVolume === "number"
                    ? ` · ${Math.round(project.sfxVolume * 100)}%`
                    : ""}
                  :
                </p>
                <ul>
                  {(project.sfxCues && project.sfxCues.length > 0
                    ? project.sfxCues.map((c) => `${c.at} — ${c.label}${c.trackName ? ` (${c.trackName})` : ""}`)
                    : (project.productionMarkers ?? [])
                  ).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
        <div className="audio-bed-versions">
          <AudioVersion
            label="1. Original (só voz)"
            url={voiceUrl}
            state={voiceUrl ? "ready" : "idle"}
          />
          <AudioVersion
            label="2. Voz + música"
            url={mixMusicUrl}
            meta={project.musicTrackName ? `Tema em loop: ${project.musicTrackName}` : undefined}
            state={
              busy === "music" || busy === "mix"
                ? "working"
                : musicReady
                  ? "ready"
                  : "idle"
            }
            emptyHint="Gera música abaixo"
          />
          <AudioVersion
            label="3. Voz + SFX"
            url={mixSfxUrl}
            meta={
              project.sfxCues?.length
                ? project.sfxCues.map((c) => `${c.at} ${c.label}`).join(" · ")
                : undefined
            }
            state={
              busy === "sfx" || busy === "mix" ? "working" : sfxReady ? "ready" : "idle"
            }
            emptyHint="Gera SFX abaixo"
          />
          <AudioVersion
            label="4. Tudo (voz + música + SFX)"
            url={mixFullUrl}
            state={
              busy === "music" || busy === "sfx" || busy === "mix"
                ? "working"
                : fullReady
                  ? "ready"
                  : "idle"
            }
            emptyHint={hasBed ? "Remistura abaixo" : "Gera música e/ou SFX"}
          />
        </div>
      </div>

      <div className="audio-bed-block">
        <h4>
          Música de fundo
          {musicReady && !busy && <span className="audio-bed-inline-ok"> · pronta</span>}
          {busy === "music" && <span className="audio-bed-inline-working"> · a gerar…</span>}
        </h4>
        <p className="portadas-actions-hint">
          Um único tema da biblioteca, em <strong>loop</strong> durante todo o vídeo. 100%
          instrumental · zero custo.
        </p>
        {project.musicTrackName && (
          <p className="audio-bed-track-name">
            Faixa actual: <strong>{project.musicTrackName}</strong>
          </p>
        )}
        <label className="portadas-label">
          Estilo musical
          <select
            value={musicStyle}
            onChange={(e) => setMusicStyle(e.target.value)}
            disabled={!!busy}
          >
            {MUSIC_STYLE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="portadas-label audio-bed-volume">
          Volume da música ({musicPct}%)
          <input
            type="range"
            min={0}
            max={20}
            step={1}
            value={musicPct}
            disabled={!!busy}
            onChange={(e) => setMusicPct(Number(e.target.value))}
          />
          <span className="portadas-actions-hint">Recomendado 5–10% (não compete com a voz).</span>
        </label>
        <div className="portadas-actions">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void runBed({ musicOnly: true, style: musicStyle }, "music")}
          >
            {busy === "music" ? "A gerar música…" : project.musicRef ? "Regenerar música" : "Gerar música"}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void runBed({ musicOff: true, remixOnly: true }, "music")}
          >
            Sem música
          </button>
        </div>
        {entries.length > 0 && (
          <p className="portadas-actions-hint">
            {entries.length} faixas na biblioteca (sem atribuição preferidas).
          </p>
        )}
      </div>

      <div className="audio-bed-block">
        <h4>
          Efeitos sonoros
          {sfxReady && !busy && <span className="audio-bed-inline-ok"> · prontos</span>}
          {busy === "sfx" && <span className="audio-bed-inline-working"> · a gerar…</span>}
        </h4>
        <p className="portadas-actions-hint">
          Efeitos só onde o <strong>roteiro</strong> menciona (telefone, silêncio, vento…) — no
          instante em que essa linha é falada.
        </p>
        <label className="portadas-label audio-bed-volume">
          Volume dos SFX ({sfxPct}%)
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={sfxPct}
            disabled={!!busy}
            onChange={(e) => setSfxPct(Number(e.target.value))}
          />
          <span className="portadas-actions-hint">Recomendado ~50%.</span>
        </label>
        <div className="portadas-actions">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void runBed({ sfxOnly: true }, "sfx")}
          >
            {busy === "sfx" ? "A gerar SFX…" : "Gerar SFX"}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void runBed({ sfxOff: true, remixOnly: true }, "sfx")}
          >
            Sem SFX
          </button>
          <button
            type="button"
            disabled={!!busy || !hasBed}
            onClick={() => void runBed({ remixOnly: true }, "mix")}
            title={!hasBed ? "Gera música ou SFX primeiro" : undefined}
          >
            {busy === "mix" ? "A remisturar…" : "Aplicar volumes / remisturar"}
          </button>
        </div>
        {project.productionMarkers && project.productionMarkers.length > 0 && (
          <p className="portadas-actions-hint">Marcadores: {project.productionMarkers.join(" · ")}</p>
        )}
        {project.sfxCues && project.sfxCues.length > 0 && (
          <ul className="audio-bed-sfx-list">
            {project.sfxCues.map((c) => (
              <li key={`${c.at}-${c.label}`}>
                <strong>{c.at}</strong> — {c.label}
                {c.trackName ? ` · ${c.trackName}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="audio-bed-block">
        <h4>Estilo visual do vídeo</h4>
        <label className="portadas-label">
          Estilo
          <select
            value={videoStyle}
            disabled={!!busy}
            onChange={(e) => setVideoStyle(e.target.value)}
          >
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
          <select
            value={presetId}
            disabled={!!busy}
            onChange={(e) => setPresetId(e.target.value)}
          >
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

function StatusChip({
  label,
  state,
  busy,
}: {
  label: string;
  state: "idle" | "ready";
  busy: boolean;
}) {
  const kind = busy ? "working" : state === "ready" ? "done" : "idle";
  const text = busy ? `${label}…` : state === "ready" ? `${label} ✓` : label;
  return <span className={`audio-bed-chip ${kind}`}>{text}</span>;
}

function AudioVersion({
  label,
  url,
  emptyHint,
  state,
  meta,
}: {
  label: string;
  url: string | null;
  emptyHint?: string;
  state: "idle" | "working" | "ready";
  meta?: string;
}) {
  return (
    <div className={`audio-bed-version is-${state}`}>
      <p className="audio-bed-version-label">
        {label}
        {state === "working" && <span className="audio-bed-inline-working"> · a gerar…</span>}
        {state === "ready" && url && <span className="audio-bed-inline-ok"> · pronto</span>}
      </p>
      {meta && <p className="portadas-actions-hint">{meta}</p>}
      {url ? (
        <audio key={url} className="review-queue-audio" controls preload="metadata" src={url} />
      ) : state === "working" ? (
        <p className="portadas-actions-hint audio-bed-version-wait">
          <span className="audio-bed-spinner" /> A processar…
        </p>
      ) : (
        <p className="portadas-actions-hint">{emptyHint ?? "Ainda não gerado"}</p>
      )}
    </div>
  );
}
