// The problem and task timers. A run is { ms, since }: the time banked by earlier stretches, and when the current
// stretch started (null while paused). Runs are keyed by item id, and one runs at a time.

export const PROBLEM_CAP = 25;

export const elapsed = (run, nowMs) => (run ? run.ms + (run.since === null ? 0 : nowMs - run.since) : 0);

const paused = (run, nowMs) => ({ ms: elapsed(run, nowMs), since: null });

export const pause = (runs, id, nowMs) => (runs[id] ? { ...runs, [id]: paused(runs[id], nowMs) } : runs);

// Starting one timer pauses whichever other one is running.
export const start = (runs, id, nowMs) => {
  if (runs[id]?.since != null) return runs;
  const next = Object.fromEntries(Object.entries(runs).map(([k, run]) => [k, run.since === null ? run : paused(run, nowMs)]));
  return { ...next, [id]: { ms: runs[id]?.ms ?? 0, since: nowMs } };
};

export const clear = (runs, id) => {
  const { [id]: _, ...rest } = runs;
  return rest;
};

// 3665000 -> "61:05": minutes are not capped at an hour.
export const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const isOver = (run, nowMs, capMin) => elapsed(run, nowMs) >= capMin * 60000;

export const toMinutes = (ms) => Math.max(1, Math.round(ms / 60000));
