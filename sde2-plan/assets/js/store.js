import * as srs from "./srs.js";

export const KEY = "sde2:v1:progress";

export const COLLECTIONS = ["days", "items", "stories"];

export const empty = () => ({ v: 1, days: {}, items: {}, stories: {} });

const META = new Set(["at", "ats"]);
const fieldsOf = (rec) => Object.keys(rec).filter((f) => !META.has(f));
// A record with no `ats`, or an `at` newer than all its `ats`, was last written by old code that only stamped `at`:
// every field then reads at `at`. New code keeps `at` never above its newest `ats` entry, so it is never misread.
const byOldCode = (rec) => !rec.ats || (rec.at ?? 0) > Math.max(0, ...Object.values(rec.ats));
// `old` is byOldCode(rec), passed in so a loop over fields computes it once.
const fieldAt = (rec, f, old = byOldCode(rec)) => (old ? rec.at : rec.ats[f] ?? rec.at) ?? 0;

// Each field whose value changed gets its own time; the others keep theirs (a stale device re-sending an old value
// must not look new). Fields from before `ats` existed take the record's old `at`.
const touch = (state, collection, key, patch, nowMs) => {
  const old = state[collection][key] ?? {};
  const wasOld = byOldCode(old);
  const ats = Object.fromEntries(fieldsOf(old).map((f) => [f, fieldAt(old, f, wasOld)]));
  for (const f of Object.keys(patch)) if (patch[f] !== old[f]) ats[f] = nowMs;
  const times = Object.values(ats);
  return { ...state, [collection]: { ...state[collection], [key]: { ...old, ...patch, at: times.length ? Math.max(...times) : nowMs, ats } } };
};

// A null `minutes` (empty box) is left out so it can't beat minutes saved on another device; setMinutes clears them.
export const setSolved = (state, id, solved, minutes, nowMs) =>
  touch(state, "items", id, minutes == null ? { solved } : { solved, minutes }, nowMs);

// Minutes only: a tick saved on another device must survive a later minutes edit here.
export const setMinutes = (state, id, minutes, nowMs) => touch(state, "items", id, { minutes }, nowMs);

// A self-test mark ("got", "partly", "missed" or null to clear) with the question text it was given against.
export const setResult = (state, id, result, text, nowMs) => touch(state, "items", id, { result, text }, nowMs);

const restart = (existing, today) => ({
  ...srs.start(today),
  history: [...(existing?.history ?? [])],
});

export const setFlag = (state, id, flag, today, nowMs) =>
  touch(state, "items", id, flag ? { flag, srs: restart(state.items[id]?.srs, today) } : { flag }, nowMs);

export const rate = (state, id, rating, today, nowMs) => {
  const current = state.items[id]?.srs ?? srs.start(today);
  return touch(state, "items", id, { srs: srs.next(current, rating, today) }, nowMs);
};

export const setDay = (state, day, patch, nowMs) => touch(state, "days", day, patch, nowMs);

export const setStory = (state, id, patch, nowMs) => touch(state, "stories", id, patch, nowMs);

const isObject = (x) => typeof x === "object" && x !== null && !Array.isArray(x);

// Per record, each field keeps the value with the larger time (b on a tie), so a stale device's unrelated write
// can't beat a newer value. Nothing in the app removes a field, so the union never brings back a deleted value.
const mergeRecord = (a, b) => {
  const out = {};
  const ats = {};
  const oldA = byOldCode(a);
  const oldB = byOldCode(b);
  for (const f of new Set([...fieldsOf(a), ...fieldsOf(b)])) {
    const fromB = !(f in a) || (f in b && fieldAt(b, f, oldB) >= fieldAt(a, f, oldA));
    out[f] = (fromB ? b : a)[f];
    ats[f] = fromB ? fieldAt(b, f, oldB) : fieldAt(a, f, oldA);
  }
  const at = Math.max(a.at ?? 0, b.at ?? 0);
  return a.ats || b.ats ? { ...out, at, ats } : { ...out, at }; // two old records stay old, so syncing them doesn't churn the repo
};

const mergeRecords = (a, b) => {
  const out = {};
  for (const [key, rec] of Object.entries(a)) if (isObject(rec)) out[key] = rec;
  for (const [key, rec] of Object.entries(b)) {
    if (!isObject(rec)) continue;
    out[key] = key in out ? mergeRecord(out[key], rec) : rec;
  }
  return out;
};

export const merge = (a, b) => {
  const out = { v: 1 };
  for (const c of COLLECTIONS) out[c] = mergeRecords(a[c] ?? {}, b[c] ?? {});
  return out;
};

export const isWellFormed = (x) =>
  isObject(x) && COLLECTIONS.every((c) => x[c] === undefined || isObject(x[c]));

const sorted = (v) =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : 1))) : v;

// True when two states hold the same data, whatever order their keys are in.
export const sameState = (a, b) => JSON.stringify(a, (_k, v) => sorted(v)) === JSON.stringify(b, (_k, v) => sorted(v));

export const load = (storage) => {
  const raw = storage.getItem(KEY);
  if (raw === null) return empty();
  try {
    const parsed = JSON.parse(raw);
    if (isWellFormed(parsed)) return merge(empty(), parsed);
  } catch {}
  storage.setItem(`${KEY}.bad`, raw);
  return empty();
};

export const save = (storage, state) => storage.setItem(KEY, JSON.stringify(state));
