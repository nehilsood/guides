import * as srs from "./srs.js";

export const KEY = "sde2:v1:progress";

export const COLLECTIONS = ["days", "items", "stories"];

export const empty = () => ({ v: 1, days: {}, items: {}, stories: {} });

const touch = (state, collection, key, patch, nowMs) => ({
  ...state,
  [collection]: {
    ...state[collection],
    [key]: { ...state[collection][key], ...patch, at: nowMs },
  },
});

export const setSolved = (state, id, solved, minutes, nowMs) =>
  touch(state, "items", id, { solved, minutes }, nowMs);

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

const at = (rec) => rec.at ?? 0;

// Per record, fields from both devices are kept; where both set a field, the record with the larger `at` wins
// (b on a tie). Nothing in the app removes a field, so the union never brings back a deleted value.
const mergeRecords = (a, b) => {
  const out = {};
  for (const [key, rec] of Object.entries(a)) if (isObject(rec)) out[key] = rec;
  for (const [key, rec] of Object.entries(b)) {
    if (!isObject(rec)) continue;
    out[key] = !(key in out) ? rec : at(rec) >= at(out[key]) ? { ...out[key], ...rec } : { ...rec, ...out[key] };
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
