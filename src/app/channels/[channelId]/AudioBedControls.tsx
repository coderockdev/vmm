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
type AudioSource = "voice" | "music" | "sfx" | "full";

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
  const [busySource, setBusySource] = useState<AudioSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flashOk, setFlashOk] = useState<string | null>(null);
  const [musicStyle, setMusicStyle] = useState(project.musicStyle || "romantico-cinematico");
  const [entries, setEntries] = useState<LibEntry[]>([]);
  const [videoStyle, setVideoStyle] = useState("scrolling-text");
  const [presetId, setPresetId] = useState("amor-amor");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [musicPct, setMusicPct] = useState(
    clampPct((project.musicVolume ?? 0.06) * 100, 6)
  );
  const [sfxPct, setSfxPct] = useState(clampPct((project.sfxVolume ?? 0.5) * 100, 50));

  const onBusyChangeRef = React.useRef(onBusyChange);
  onBusyChangeRef.current = onBusyChange;

  useEffect(() => {
    onBusyChangeRef.current?.(busy ? BUSY_LABEL[busy] : null);
  }, [busy]);

  // Do NOT clear parent busy on unmount — a video render keeps running server-side
  // and project/job status (polled) owns the UI while the user navigates tabs.

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

  async function runBed(
    body: Record<string, unknown>,
    kind: Exclude<BedBusy, null | "video" | "preview">
  ): Promise<VideoProject | null> {
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
      if (data.project) {
        onUpdated(data.project);
        return data.project as VideoProject;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function ensureAudioForSource(source: AudioSource): Promise<VideoProject | null> {
    let latest = project;
    if (source === "voice") return latest;

    if (source === "music") {
      if (latest.mixMusicRef) return latest;
      const next = await runBed({ musicOnly: true, style: musicStyle }, "music");
      return next ?? null;
    }

    if (source === "sfx") {
      if (latest.mixSfxRef) return latest;
      const next = await runBed({ sfxOnly: true }, "sfx");
      return next ?? null;
    }

    // full = voice + music + sfx
    if (latest.mixAudioRef && latest.musicRef && latest.sfxRef) return latest;
    if (!latest.musicRef || !latest.mixMusicRef) {
      const next = await runBed({ musicOnly: true, style: musicStyle }, "music");
      if (!next) return null;
      latest = next;
    }
    if (!latest.sfxRef || !latest.mixSfxRef) {
      const next = await runBed({ sfxOnly: true }, "sfx");
      if (!next) return null;
      latest = next;
    }
    if (!latest.mixAudioRef) {
      const next = await runBed({ remixOnly: true }, "mix");
      if (!next) return null;
      latest = next;
    }
    return latest;
  }

  async function runVideoFromSource(source: AudioSource, preview = false) {
    setBusySource(source);
    setError(null);
    setFlashOk(null);
    let latestProject = project;
    try {
      const ready = await ensureAudioForSource(source);
      if (source !== "voice" && !ready) {
        throw new Error("Não foi possível preparar o áudio desta versão.");
      }
      latestProject = ready ?? project;

      // Optimistic status so other tabs keep showing progress via poll.
      if (!preview) {
        onUpdated({
          ...latestProject,
          status: "rendering",
          errorMessage: null,
        });
      }

      setBusy(preview ? "preview" : "video");
      const res = await fetch(`/api/videos/${project.id}/render-style`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          styleId: videoStyle,
          presetId,
          preview,
          previewSeconds: 12,
          aspectRatio: "9:16",
          audioSource: source,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha no render");
      if (data.url) setPreviewUrl(data.url);
      if (data.project) onUpdated(data.project);
      const labels: Record<AudioSource, string> = {
        voice: "só voz",
        music: "voz+música",
        sfx: "voz+SFX",
        full: "mix completo",
      };
      setFlashOk(
        preview ? `Preview (${labels[source]}) pronto` : `Vídeo gerado (${labels[source]})`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      onUpdated({
        ...latestProject,
        status: "failed",
        errorMessage: message,
      });
    } finally {
      setBusy(null);
      setBusySource(null);
    }
  }

  async function runBedUi(body: Record<string, unknown>, kind: "music" | "sfx" | "mix") {
    const next = await runBed(body, kind);
    if (!next) return;
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
  }

  const mixMusicUrl = project.mixMusicRef ? mediaUrl(channelId, project.mixMusicRef) : null;
  const mixSfxUrl = project.mixSfxRef ? mediaUrl(channelId, project.mixSfxRef) : null;
  const mixFullUrl = project.mixAudioRef ? mediaUrl(channelId, project.mixAudioRef) : null;
  const hasBed = Boolean(project.musicRef || project.sfxRef);
  const musicReady = Boolean(project.mixMusicRef);
  const sfxReady = Boolean(project.mixSfxRef);
  const fullReady = Boolean(project.mixAudioRef);
  // Only lock bed buttons while music/sfx/mix is running — a long video render
  // must not freeze "Gerar música / SFX".
  const bedBusy = busy === "music" || busy === "sfx" || busy === "mix";
  const anyBusy = busy != null;

  return (
    <div className={`audio-bed-controls${anyBusy ? " is-busy" : ""}`}>
      {busy && (
        <p className="audio-bed-banner is-working" role="status" aria-live="polite">
          <span className="audio-bed-spinner" />
          {BUSY_LABEL[busy]}
          {busySource ? ` (${busySource})` : ""}
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
          Fluxo recomendado: <strong>Gerar áudio</strong> → ouvir no player → só depois{" "}
          <strong>Gerar vídeo</strong> (opcional).
        </p>
        <div className="audio-bed-chips">
          <StatusChip label="Voz" state={voiceUrl ? "ready" : "idle"} busy={false} />
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
        {(project.musicTrackName ||
          (project.sfxCues && project.sfxCues.length > 0) ||
          (project.productionMarkers && project.productionMarkers.length > 0)) && (
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
            {project.sfxCues?.length || project.productionMarkers?.length ? (
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
                    ? project.sfxCues.map(
                        (c) => `${c.at} — ${c.label}${c.trackName ? ` (${c.trackName})` : ""}`
                      )
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
            videoBusy={busySource === "voice" && (busy === "video" || busy === "preview")}
            videoDisabled={anyBusy}
            onGenerateVideo={() => void runVideoFromSource("voice")}
          />
          <AudioVersion
            label="2. Voz + música"
            url={mixMusicUrl}
            meta={project.musicTrackName ? `Tema em loop: ${project.musicTrackName}` : undefined}
            state={
              busy === "music"
                ? "working"
                : musicReady
                  ? "ready"
                  : "idle"
            }
            emptyHint="Gera a música, ouve aqui, e só depois gera o vídeo se quiseres."
            videoBusy={busySource === "music" && (busy === "video" || busy === "music" || busy === "mix")}
            audioBusy={busy === "music"}
            audioDisabled={bedBusy}
            videoDisabled={anyBusy}
            audioButtonLabel={musicReady ? "Regenerar música" : "Gerar música"}
            onGenerateAudio={() => void runBedUi({ musicOnly: true, style: musicStyle }, "music")}
            onGenerateVideo={() => void runVideoFromSource("music")}
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
              busy === "sfx"
                ? "working"
                : sfxReady
                  ? "ready"
                  : "idle"
            }
            emptyHint="Gera os SFX, ouve aqui, e só depois gera o vídeo se quiseres."
            videoBusy={busySource === "sfx" && (busy === "video" || busy === "sfx" || busy === "mix")}
            audioBusy={busy === "sfx"}
            audioDisabled={bedBusy}
            videoDisabled={anyBusy}
            audioButtonLabel={sfxReady ? "Regenerar SFX" : "Gerar SFX"}
            onGenerateAudio={() => void runBedUi({ sfxOnly: true }, "sfx")}
            onGenerateVideo={() => void runVideoFromSource("sfx")}
          />
          <AudioVersion
            label="4. Tudo (voz + música + SFX)"
            url={mixFullUrl}
            state={
              busySource === "full" && bedBusy
                ? "working"
                : busy === "music" || busy === "sfx" || busy === "mix"
                  ? "working"
                  : fullReady
                    ? "ready"
                    : "idle"
            }
            emptyHint="Gera o mix completo, ouve, e só depois gera o vídeo se quiseres."
            videoBusy={
              busySource === "full" &&
              (busy === "video" || busy === "music" || busy === "sfx" || busy === "mix")
            }
            audioBusy={busy === "music" || busy === "sfx" || busy === "mix"}
            audioDisabled={bedBusy}
            videoDisabled={anyBusy}
            audioButtonLabel={fullReady ? "Regenerar mix" : "Gerar mix"}
            onGenerateAudio={() => {
              void (async () => {
                const ready = await ensureAudioForSource("full");
                if (ready) setFlashOk("Mix pronto — ouve a versão 4; o vídeo fica opcional.");
              })();
            }}
            onGenerateVideo={() => void runVideoFromSource("full")}
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
            disabled={bedBusy}
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
            disabled={bedBusy}
            onChange={(e) => setMusicPct(Number(e.target.value))}
          />
          <span className="portadas-actions-hint">Recomendado 5–10% (não compete com a voz).</span>
        </label>
        <div className="portadas-actions">
          <button
            type="button"
            disabled={bedBusy}
            onClick={() => void runBedUi({ musicOnly: true, style: musicStyle }, "music")}
          >
            {busy === "music" ? "A gerar música…" : project.musicRef ? "Regenerar música" : "Gerar música"}
          </button>
          <button
            type="button"
            disabled={bedBusy}
            onClick={() => void runBedUi({ musicOff: true, remixOnly: true }, "music")}
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
            disabled={bedBusy}
            onChange={(e) => setSfxPct(Number(e.target.value))}
          />
          <span className="portadas-actions-hint">Recomendado ~50%.</span>
        </label>
        <div className="portadas-actions">
          <button
            type="button"
            disabled={bedBusy}
            onClick={() => void runBedUi({ sfxOnly: true }, "sfx")}
          >
            {busy === "sfx" ? "A gerar SFX…" : "Gerar SFX"}
          </button>
          <button
            type="button"
            disabled={bedBusy}
            onClick={() => void runBedUi({ sfxOff: true, remixOnly: true }, "sfx")}
          >
            Sem SFX
          </button>
          <button
            type="button"
            disabled={bedBusy || !hasBed}
            onClick={() => void runBedUi({ remixOnly: true }, "mix")}
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
            disabled={anyBusy}
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
            disabled={anyBusy}
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
          <button type="button" disabled={anyBusy} onClick={() => void runVideoFromSource("voice", true)}>
            {busy === "preview" ? "Preview…" : "Preview 12s (só voz)"}
          </button>
          <button type="button" disabled={anyBusy} onClick={() => void runVideoFromSource("voice")}>
            {busy === "video" && busySource === "voice" ? "A renderizar…" : "Gerar vídeo (só voz)"}
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
  audioDisabled,
  videoDisabled,
  videoBusy,
  audioBusy,
  onGenerateAudio,
  audioButtonLabel,
  onGenerateVideo,
}: {
  label: string;
  url: string | null;
  emptyHint?: string;
  state: "idle" | "working" | "ready";
  meta?: string;
  audioDisabled?: boolean;
  videoDisabled?: boolean;
  videoBusy?: boolean;
  audioBusy?: boolean;
  onGenerateAudio?: () => void;
  audioButtonLabel?: string;
  onGenerateVideo?: () => void;
}) {
  return (
    <div className={`audio-bed-version is-${state}`}>
      <div className="audio-bed-version-head">
        <p className="audio-bed-version-label">
          {label}
          {state === "working" && <span className="audio-bed-inline-working"> · a gerar…</span>}
          {state === "ready" && url && <span className="audio-bed-inline-ok"> · pronto</span>}
        </p>
        <div className="audio-bed-version-actions">
          {onGenerateAudio && (
            <button
              type="button"
              className="audio-bed-version-audio-btn"
              disabled={Boolean(audioDisabled || audioBusy)}
              onClick={onGenerateAudio}
            >
              {audioBusy
                ? "A gerar áudio…"
                : audioButtonLabel ?? (url ? "Regenerar áudio" : "Gerar áudio")}
            </button>
          )}
          {onGenerateVideo && (
            <button
              type="button"
              className="audio-bed-version-video-btn"
              disabled={Boolean(videoDisabled)}
              onClick={onGenerateVideo}
            >
              {videoBusy ? "A gerar vídeo…" : "Gerar vídeo"}
            </button>
          )}
        </div>
      </div>
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
