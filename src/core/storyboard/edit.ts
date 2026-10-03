import {
  Storyboard,
  StoryboardShot,
  VisualType,
  allShots,
  isVisualType,
} from "./types";

function uid(): string {
  return crypto.randomUUID();
}

export function blankShot(startSec: number, endSec: number): StoryboardShot {
  return {
    id: uid(),
    index: 1,
    startSec,
    endSec: Math.max(startSec + 0.4, endSec),
    narration: "",
    speech: [
      {
        text: "",
        speakerId: "narrator",
        speakerName: "Narrador",
        voiceId: null,
        emotion: null,
        delivery: null,
        voiceEffect: "none",
      },
    ],
    visualType: "cinematic-image",
    visual: "",
    imagePrompt: "",
    motion: "Slow push-in.",
    sfx: [],
    musicMood: "none",
    musicAction: "continue",
    silenceSec: 0,
    onScreenText: "",
    transition: "cut",
    locationCard: null,
    map: null,
    status: "planned",
    assetRef: null,
    error: null,
  };
}

function reindex(board: Storyboard): Storyboard {
  let sceneIndex = 1;
  const scenes = board.scenes.map((scene) => {
    let shotIndex = 1;
    const shots = scene.shots.map((shot) => ({ ...shot, index: shotIndex++ }));
    return { ...scene, index: sceneIndex++, shots };
  });
  return { ...board, scenes, status: "draft", updatedAt: new Date().toISOString() };
}

export function findShot(board: Storyboard, shotId: string): { sceneIndex: number; shotIndex: number } | null {
  for (let s = 0; s < board.scenes.length; s++) {
    const i = board.scenes[s].shots.findIndex((shot) => shot.id === shotId);
    if (i >= 0) return { sceneIndex: s, shotIndex: i };
  }
  return null;
}

export function updateShot(board: Storyboard, shotId: string, patch: Partial<StoryboardShot>): Storyboard {
  const next = structuredClone(board);
  const at = findShot(next, shotId);
  if (!at) return next;
  const shot = next.scenes[at.sceneIndex].shots[at.shotIndex];
  const visualType = patch.visualType && isVisualType(patch.visualType) ? patch.visualType : shot.visualType;
  next.scenes[at.sceneIndex].shots[at.shotIndex] = {
    ...shot,
    ...patch,
    visualType: visualType as VisualType,
    id: shot.id,
    status: patch.status ?? "planned",
    assetRef: patch.assetRef === undefined ? null : patch.assetRef,
    error: patch.error === undefined ? null : patch.error,
  };
  return reindex(next);
}

export function deleteShot(board: Storyboard, shotId: string): Storyboard {
  const next = structuredClone(board);
  next.scenes = next.scenes
    .map((scene) => ({ ...scene, shots: scene.shots.filter((shot) => shot.id !== shotId) }))
    .filter((scene) => scene.shots.length > 0);
  if (next.scenes.length === 0) {
    next.scenes = [
      {
        id: uid(),
        index: 1,
        title: "SCENE",
        shots: [blankShot(0, Math.min(6, next.durationSec || 6))],
      },
    ];
  }
  return reindex(next);
}

export function addShot(board: Storyboard, shotId: string, where: "before" | "after"): Storyboard {
  const next = structuredClone(board);
  const at = findShot(next, shotId);
  if (!at) return next;
  const shot = next.scenes[at.sceneIndex].shots[at.shotIndex];
  const span = Math.max(2, (shot.endSec - shot.startSec) / 2);
  const created = blankShot(where === "before" ? shot.startSec : shot.endSec, (where === "before" ? shot.startSec : shot.endSec) + span);
  const insertAt = where === "before" ? at.shotIndex : at.shotIndex + 1;
  next.scenes[at.sceneIndex].shots.splice(insertAt, 0, created);
  return reindex(next);
}

export function splitShot(board: Storyboard, shotId: string): Storyboard {
  const next = structuredClone(board);
  const at = findShot(next, shotId);
  if (!at) return next;
  const shot = next.scenes[at.sceneIndex].shots[at.shotIndex];
  const mid = shot.startSec + (shot.endSec - shot.startSec) / 2;
  if (mid - shot.startSec < 0.4) return next;
  const second = blankShot(mid, shot.endSec);
  second.narration = shot.narration;
  second.visualType = shot.visualType;
  second.visual = shot.visual;
  second.musicMood = shot.musicMood;
  second.musicAction = "continue";
  shot.endSec = mid;
  shot.assetRef = null;
  shot.status = "planned";
  next.scenes[at.sceneIndex].shots.splice(at.shotIndex + 1, 0, second);
  return reindex(next);
}

export function mergeShotWithNext(board: Storyboard, shotId: string): Storyboard {
  const next = structuredClone(board);
  const at = findShot(next, shotId);
  if (!at) return next;
  const shots = next.scenes[at.sceneIndex].shots;
  const b = shots[at.shotIndex + 1];
  if (!b) return next;
  const a = shots[at.shotIndex];
  a.endSec = b.endSec;
  a.narration = [a.narration, b.narration].filter(Boolean).join(" ");
  a.assetRef = null;
  a.status = "planned";
  shots.splice(at.shotIndex + 1, 1);
  return reindex(next);
}

export function coverageGaps(board: Storyboard): Array<{ startSec: number; endSec: number }> {
  const shots = allShots(board).slice().sort((a, b) => a.startSec - b.startSec);
  const gaps: Array<{ startSec: number; endSec: number }> = [];
  let cursor = 0;
  for (const shot of shots) {
    if (shot.startSec - cursor > 0.35) gaps.push({ startSec: cursor, endSec: shot.startSec });
    cursor = Math.max(cursor, shot.endSec);
  }
  if (board.durationSec - cursor > 0.35) gaps.push({ startSec: cursor, endSec: board.durationSec });
  return gaps;
}
