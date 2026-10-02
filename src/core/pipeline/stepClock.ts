/**
 * Start and end of each production step, kept on the job message so a later
 * update does not erase the clock the panel already showed.
 */

export const STEP_ORDER = ["roteiro", "voz", "musica", "render", "portada", "copy", "youtube"] as const;
export type StepId = (typeof STEP_ORDER)[number];

export type StepSpan = { startedAt: string | null; finishedAt: string | null };
export type StepClock = Partial<Record<StepId, StepSpan>>;

const MARK = "\n@@steps@@";

export function humanOf(raw: string | null | undefined): string {
  const text = raw || "";
  const at = text.indexOf(MARK);
  return (at < 0 ? text : text.slice(0, at)).trim();
}

export function readClock(raw: string | null | undefined): StepClock {
  const text = raw || "";
  const at = text.indexOf(MARK);
  if (at < 0) return {};
  try {
    const parsed = JSON.parse(text.slice(at + MARK.length)) as StepClock;
    if (!parsed || typeof parsed !== "object") return {};
    const clock: StepClock = {};
    for (const id of STEP_ORDER) {
      const span = parsed[id];
      if (!span || typeof span !== "object") continue;
      clock[id] = {
        startedAt: typeof span.startedAt === "string" ? span.startedAt : null,
        finishedAt: typeof span.finishedAt === "string" ? span.finishedAt : null,
      };
    }
    return clock;
  } catch {
    return {};
  }
}

export function packClock(human: string, clock: StepClock): string {
  const clean = humanOf(human);
  const kept = STEP_ORDER.some((id) => clock[id]?.startedAt || clock[id]?.finishedAt);
  if (!kept) return clean;
  return `${clean}${MARK}${JSON.stringify(clock)}`;
}

export function activeStep(status: string, message: string): StepId | null {
  const text = message.toLowerCase();
  if (status === "failed") return null;
  if (status === "completed" || /youtube|a subir/.test(text)) return "youtube";
  if (/manchete|descri/.test(text)) return "copy";
  if (/portada/.test(text)) return "portada";
  if (status === "rendering" || /renderiz/.test(text)) return "render";
  if (status === "composing" || status === "timing" || /música|musica|sfx/.test(text)) return "musica";
  if (status === "audio" || /áudio|audio|narra/.test(text)) return "voz";
  if (status === "planned" && /na fila/.test(text)) return null;
  if (status === "script" || status === "planned") return "roteiro";
  return null;
}

function closeOpen(clock: StepClock, before: StepId | null, at: string, jobCreatedAt: string) {
  const stop = before ? STEP_ORDER.indexOf(before) : STEP_ORDER.length;
  for (let i = 0; i < stop; i++) {
    const id = STEP_ORDER[i];
    const span = clock[id] ?? { startedAt: null, finishedAt: null };
    if (!span.startedAt && id === "roteiro") span.startedAt = jobCreatedAt;
    if (span.startedAt && !span.finishedAt) span.finishedAt = at;
    if (span.startedAt || span.finishedAt) clock[id] = span;
  }
}

/**
 * Remember when the current step began. The first time we see a step that is
 * already running, its start is the job's previous update — not "now".
 */
export function advanceClock(
  clock: StepClock,
  args: {
    status: string;
    message: string;
    now: string;
    jobCreatedAt: string;
    previousUpdatedAt: string;
    previousStatus: string;
  }
): StepClock {
  const next: StepClock = { ...clock };
  const active = activeStep(args.status, args.message);
  const same = args.previousStatus === args.status;
  const stamp = same ? args.previousUpdatedAt : args.now;

  if (args.status === "failed" || args.status === "completed") {
    closeOpen(next, null, args.now, args.jobCreatedAt);
    return next;
  }

  if (!active) {
    if (args.status === "planned" && /na fila/i.test(args.message)) {
      const span = next.roteiro ?? { startedAt: args.jobCreatedAt, finishedAt: null };
      if (!span.startedAt) span.startedAt = args.jobCreatedAt;
      if (!span.finishedAt) span.finishedAt = args.jobCreatedAt;
      next.roteiro = span;
    }
    return next;
  }

  closeOpen(next, active, stamp, args.jobCreatedAt);
  const current = next[active] ?? { startedAt: null, finishedAt: null };
  if (!current.startedAt) current.startedAt = stamp;
  next[active] = current;
  return next;
}
