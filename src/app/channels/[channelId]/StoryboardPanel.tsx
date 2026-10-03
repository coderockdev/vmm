"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  MUSIC_ACTIONS,
  MUSIC_MOODS,
  SFX_PRESETS,
  TRANSITIONS,
  VISUAL_TYPES,
  VISUAL_TYPE_LABELS,
  Storyboard,
  StoryboardShot,
  VisualType,
  allShots,
  formatTimecode,
  shotCount,
} from "../../../core/storyboard/types";
import { addShot, coverageGaps, deleteShot, mergeShotWithNext, splitShot, updateShot } from "../../../core/storyboard/edit";

interface Episode {
  id: string;
  title: string;
  hasAudio: boolean;
}

export function StoryboardPanel({
  episodes,
  initialProjectId,
}: {
  episodes: Episode[];
  initialProjectId?: string | null;
}) {
  const [projectId, setProjectId] = useState(initialProjectId || episodes.find((episode) => episode.hasAudio)?.id || episodes[0]?.id || "");
  const [board, setBoard] = useState<Storyboard | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [hasScript, setHasScript] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (initialProjectId) setProjectId(initialProjectId);
  }, [initialProjectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setError(null);
    fetch(`/api/videos/${projectId}/storyboard`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load the storyboard.");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setBoard(data.storyboard);
        setHasAudio(Boolean(data.hasAudio));
        setHasScript(Boolean(data.hasScript));
        setDurationSec(Number(data.durationSec) || 0);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the storyboard.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const shots = board ? allShots(board) : [];
  const gaps = useMemo(() => (board ? coverageGaps(board) : []), [board]);

  async function post(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${projectId}/storyboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, storyboard: board, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Request failed.");
      if (data.storyboard) setBoard(data.storyboard);
      if (data.board) setBoard(data.board);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  function edit(shotId: string, patch: Partial<StoryboardShot>) {
    if (!board) return;
    const next = updateShot(board, shotId, { ...patch, status: "planned", assetRef: null, error: null });
    setBoard(next);
  }

  async function generateAssets() {
    let remaining = 1;
    let guard = 0;
    while (remaining > 0 && guard < 30) {
      guard += 1;
      const data = await post("generate-assets");
      if (!data) return;
      remaining = Number(data.remainingImages) || 0;
    }
  }

  return (
    <section className="storyboard-page">
      <header className="storyboard-head">
        <div>
          <p className="storyboard-kicker">SCRIPT → AUDIO → STORYBOARD → ASSETS → RENDER</p>
          <h2>STORYBOARD</h2>
          <p>The narration says when. This plan says what the viewer sees and hears. Asset generation does not invent a shot.</p>
        </div>
        <label>
          Episode
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            {episodes.length === 0 && <option value="">No episode yet</option>}
            {episodes.map((episode) => (
              <option key={episode.id} value={episode.id}>
                {episode.title}
                {episode.hasAudio ? "" : " — waiting for audio"}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error && <p className="generation-error">{error}</p>}

      {!projectId && <p>Create a script and record the narration. The storyboard comes after that audio.</p>}

      {projectId && !hasScript && <p>This episode has no script yet.</p>}
      {projectId && hasScript && !hasAudio && (
        <p>The storyboard waits for the narration. The times come from that recording, not from a guess inside the renderer.</p>
      )}

      {projectId && hasAudio && !board && (
        <button type="button" className="storyboard-primary" disabled={Boolean(busy)} onClick={() => void post("generate")}>
          {busy === "generate" ? "Directing…" : "GENERATE STORYBOARD"}
        </button>
      )}

      {board && (
        <>
          <div className="storyboard-stats">
            <div>
              <span>Episode</span>
              <strong>{board.title}</strong>
            </div>
            <div>
              <span>Total duration</span>
              <strong>{formatTimecode(board.durationSec || durationSec)}</strong>
            </div>
            <div>
              <span>Scenes</span>
              <strong>{board.scenes.length}</strong>
            </div>
            <div>
              <span>Shots</span>
              <strong>{shotCount(board)}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{board.status === "approved" ? "Approved" : "Draft"}</strong>
            </div>
          </div>

          <div className="storyboard-toolbar">
            <label>
              Render mode
              <select
                value={board.renderMode}
                onChange={(event) =>
                  setBoard({ ...board, renderMode: event.target.value === "cinematic" ? "cinematic" : "quick", status: "draft" })
                }
              >
                <option value="quick">QUICK — stills, cards, maps, slow move</option>
                <option value="cinematic">CINEMATIC — same plan, heavier engines later</option>
              </select>
            </label>
            <button type="button" disabled={Boolean(busy)} onClick={() => void post("generate")}>
              {busy === "generate" ? "Directing…" : "GENERATE STORYBOARD"}
            </button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void post("save")}>
              Save draft
            </button>
            <button type="button" className="storyboard-primary" disabled={Boolean(busy)} onClick={() => void post("approve")}>
              Approve
            </button>
            <button type="button" disabled={Boolean(busy) || board.status !== "approved"} onClick={() => void generateAssets()}>
              {busy === "generate-assets" ? "Generating assets…" : "GENERATE ASSETS"}
            </button>
            <button type="button" disabled={Boolean(busy) || board.status !== "approved" || board.renderMode !== "quick"} onClick={() => void post("render-quick")}>
              {busy === "render-quick" ? "Rendering…" : "Render quick"}
            </button>
          </div>

          {gaps.length > 0 && (
            <p className="storyboard-gap">
              Open time with no shot: {gaps.map((gap) => `${formatTimecode(gap.startSec)}–${formatTimecode(gap.endSec)}`).join(", ")}. Add a shot. The renderer will not fill this.
            </p>
          )}

          <ol className="storyboard-timeline">
            {board.scenes.map((scene) => {
              const start = scene.shots[0]?.startSec ?? 0;
              const end = scene.shots[scene.shots.length - 1]?.endSec ?? start;
              return (
                <li key={scene.id}>
                  <span>
                    {formatTimecode(start)} ━━━━━ {formatTimecode(end)}
                  </span>
                  <strong>{scene.title}</strong>
                </li>
              );
            })}
          </ol>

          <div className="storyboard-cards">
            {board.scenes.map((scene) => (
              <section key={scene.id}>
                <h3>
                  SCENE {String(scene.index).padStart(2, "0")} — {scene.title}
                </h3>
                {scene.shots.map((shot) => (
                  <article key={shot.id} className={openId === shot.id ? "open" : ""}>
                    <button type="button" className="storyboard-card-toggle" onClick={() => setOpenId(openId === shot.id ? null : shot.id)}>
                      <span>
                        SHOT {scene.index}.{shot.index} · {formatTimecode(shot.startSec)} → {formatTimecode(shot.endSec)}
                      </span>
                      <span>{VISUAL_TYPE_LABELS[shot.visualType]}</span>
                      <span>{shot.status}</span>
                    </button>
                    {openId === shot.id && (
                      <div className="storyboard-fields">
                        <label>
                          TIMECODE
                          <span>
                            <input
                              type="number"
                              step="0.1"
                              value={shot.startSec}
                              onChange={(event) => edit(shot.id, { startSec: Number(event.target.value) })}
                            />
                            →
                            <input
                              type="number"
                              step="0.1"
                              value={shot.endSec}
                              onChange={(event) => edit(shot.id, { endSec: Number(event.target.value) })}
                            />
                          </span>
                        </label>
                        <label>
                          NARRATION
                          <textarea value={shot.narration} onChange={(event) => edit(shot.id, { narration: event.target.value })} />
                        </label>
                        <label>
                          VISUAL TYPE
                          <select
                            value={shot.visualType}
                            onChange={(event) => edit(shot.id, { visualType: event.target.value as VisualType })}
                          >
                            {VISUAL_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {VISUAL_TYPE_LABELS[type]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          VISUAL
                          <textarea value={shot.visual} onChange={(event) => edit(shot.id, { visual: event.target.value })} />
                        </label>
                        <label>
                          PROMPT
                          <textarea value={shot.imagePrompt} onChange={(event) => edit(shot.id, { imagePrompt: event.target.value })} />
                        </label>
                        <label>
                          MOTION
                          <input value={shot.motion} onChange={(event) => edit(shot.id, { motion: event.target.value })} />
                        </label>
                        {shot.visualType === "location-card" && (
                          <label>
                            LOCATION CARD
                            <textarea
                              value={(shot.locationCard?.lines ?? []).join("\n")}
                              onChange={(event) =>
                                edit(shot.id, {
                                  locationCard: {
                                    lines: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean),
                                    coordinates: shot.locationCard?.coordinates ?? null,
                                  },
                                })
                              }
                            />
                          </label>
                        )}
                        {shot.visualType === "map" && (
                          <label>
                            MAP STOPS
                            <textarea
                              value={[shot.map?.startLabel, ...(shot.map?.stops ?? []), shot.map?.endLabel].filter(Boolean).join("\n")}
                              onChange={(event) => {
                                const labels = event.target.value.split("\n").map((line) => line.trim()).filter(Boolean);
                                edit(shot.id, {
                                  map: {
                                    mapType: "route",
                                    startLabel: labels[0] ?? "",
                                    endLabel: labels.length > 1 ? labels[labels.length - 1] : "",
                                    stops: labels.slice(1, -1),
                                    camera: shot.map?.camera ?? "hold",
                                    animateRoute: true,
                                    labels: true,
                                  },
                                });
                              }}
                            />
                          </label>
                        )}
                        <label>
                          SFX
                          <span className="storyboard-sfx">
                            {shot.sfx.map((cue, index) => (
                              <span key={cue.id}>
                                <select
                                  value={cue.preset}
                                  onChange={(event) => {
                                    const sfx = shot.sfx.slice();
                                    sfx[index] = { ...cue, preset: event.target.value as typeof cue.preset };
                                    edit(shot.id, { sfx });
                                  }}
                                >
                                  {SFX_PRESETS.map((preset) => (
                                    <option key={preset} value={preset}>
                                      {preset}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={cue.startSec}
                                  onChange={(event) => {
                                    const sfx = shot.sfx.slice();
                                    sfx[index] = { ...cue, startSec: Number(event.target.value) };
                                    edit(shot.id, { sfx });
                                  }}
                                />
                                →
                                <input
                                  type="number"
                                  step="0.1"
                                  value={cue.endSec}
                                  onChange={(event) => {
                                    const sfx = shot.sfx.slice();
                                    sfx[index] = { ...cue, endSec: Number(event.target.value) };
                                    edit(shot.id, { sfx });
                                  }}
                                />
                              </span>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                edit(shot.id, {
                                  sfx: [
                                    ...shot.sfx,
                                    { id: crypto.randomUUID(), preset: "radio-static", fileHint: null, startSec: 0, endSec: 2 },
                                  ],
                                })
                              }
                            >
                              Add SFX
                            </button>
                          </span>
                        </label>
                        <label>
                          MUSIC
                          <span>
                            <select value={shot.musicMood} onChange={(event) => edit(shot.id, { musicMood: event.target.value as StoryboardShot["musicMood"] })}>
                              {MUSIC_MOODS.map((mood) => (
                                <option key={mood} value={mood}>
                                  {mood}
                                </option>
                              ))}
                            </select>
                            <select value={shot.musicAction} onChange={(event) => edit(shot.id, { musicAction: event.target.value as StoryboardShot["musicAction"] })}>
                              {MUSIC_ACTIONS.map((action) => (
                                <option key={action} value={action}>
                                  {action}
                                </option>
                              ))}
                            </select>
                          </span>
                        </label>
                        <label>
                          SILENCE (seconds)
                          <input type="number" step="0.1" value={shot.silenceSec} onChange={(event) => edit(shot.id, { silenceSec: Number(event.target.value) })} />
                        </label>
                        <label>
                          ON-SCREEN TEXT
                          <input value={shot.onScreenText} onChange={(event) => edit(shot.id, { onScreenText: event.target.value })} />
                        </label>
                        <label>
                          TRANSITION
                          <select value={shot.transition} onChange={(event) => edit(shot.id, { transition: event.target.value as StoryboardShot["transition"] })}>
                            {TRANSITIONS.map((transition) => (
                              <option key={transition} value={transition}>
                                {transition}
                              </option>
                            ))}
                          </select>
                        </label>
                        <p>STATUS · {shot.status}{shot.assetRef ? " · asset ready" : ""}{shot.error ? ` · ${shot.error}` : ""}</p>
                        <div className="storyboard-shot-actions">
                          <button type="button" disabled={Boolean(busy)} onClick={() => void post("regenerate-shot", { shotId: shot.id })}>
                            REGENERATE SHOT
                          </button>
                          <button type="button" onClick={() => setBoard(addShot(board, shot.id, "before"))}>ADD SHOT BEFORE</button>
                          <button type="button" onClick={() => setBoard(addShot(board, shot.id, "after"))}>ADD SHOT AFTER</button>
                          <button type="button" onClick={() => setBoard(splitShot(board, shot.id))}>SPLIT SHOT</button>
                          <button type="button" onClick={() => setBoard(mergeShotWithNext(board, shot.id))}>MERGE SHOTS</button>
                          <button type="button" onClick={() => setBoard(deleteShot(board, shot.id))}>DELETE SHOT</button>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </section>
            ))}
          </div>
          {shots.length === 0 && <p>This board has no shots.</p>}
        </>
      )}
    </section>
  );
}
