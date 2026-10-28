import * as srs from "./srs.js";

export const KEY = "sde2:v1:progress";

export const COLLECTIONS = ["days", "items", "stories"];

export const empty = () => ({ v: 1, days: {}, items: {}, stories: {} });

const META = new Set(["at", "ats"]);
const fieldsOf = (rec) => Object.keys(rec).filter((f) => !META.has(f));
// A record with no `ats`, or an `at` newer than all its `ats`, was last written by old code that only stamped `at`:
// every field then reads at `at`. New code keeps `at` never above its newest `ats` entry, so it is never misread.
const byOldCode = (rec) => !rec.ats || (rec.at ?? 0) > Math.max(0, ...Object.values(rec.ats));
// When field `f` was written. `old` is byOldCode(rec), passed in so a loop over fields computes it once.
export const fieldTime = (rec, f, old = byOldCode(rec)) => (old ? rec.at : rec.ats[f] ?? rec.at) ?? 0;

// Each field whose value changed gets its own time; the others keep theirs (a stale device re-sending an old value
// must not look new). Fields from before `ats` existed take the record's old `at`.
const touch = (state, collection, key, patch, nowMs) => {
  const old = state[collection][key] ?? {};
  const wasOld = byOldCode(old);
  const ats = Object.fromEntries(fieldsOf(old).map((f) => [f, fieldTime(old, f, wasOld)]));
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

// One step of help on a problem or re-solve task ("idea" or "example"); its tick and minutes are left alone.
export const setHelp = (state, answerId, step, nowMs) => touch(state, "items", answerId, { [step]: true }, nowMs);

// Folds a coding row's help out of sight (true) or back (false); the help taken and the revision stay as they are.
export const hideHelp = (state, answerId, hidden, nowMs) => touch(state, "items", answerId, { helpHidden: hidden }, nowMs);

// Looking at the answer marks the item and puts the problem back on the review schedule from today.
export const showAnswer = (state, answerId, flagId, today, nowMs) =>
  setFlag(touch(state, "items", answerId, { answer: true }, nowMs), flagId, true, today, nowMs);

export const rate = (state, id, rating, today, nowMs) => {
  const current = state.items[id]?.srs ?? srs.start(today);
  return touch(state, "items", id, { srs: srs.next(current, rating, today) }, nowMs);
};

// "Skip it" on a reading part; `id` is the full item key (t:<part id>).
export const setSkipped = (state, id, nowMs) => touch(state, "items", id, { skipped: true }, nowMs);

// Lesson revision records are l:<lesson>. Each writer patches only the fields it changes, so a stale device
// can't wipe a newer value of a field it didn't touch.
const lessonKey = (lesson) => `l:${lesson}`;
const lessonOf = (state, lesson) => state.items[lessonKey(lesson)] ?? {};

export const startLesson = (state, lesson, today, nowMs) =>
  lessonOf(state, lesson).started
    ? state
    : touch(state, "items", lessonKey(lesson), { started: today }, nowMs);

// A null result removes the mark. A new `marks` object is written, never the old one changed.
export const markLesson = (state, lesson, qid, result, nowMs) => {
  const { [qid]: _gone, ...rest } = lessonOf(state, lesson).marks ?? {};
  return touch(state, "items", lessonKey(lesson), { marks: result == null ? rest : { ...rest, [qid]: result } }, nowMs);
};

export const rateLesson = (state, lesson, rating, today, nowMs) => {
  const { visits = [], marks = {} } = lessonOf(state, lesson);
  return touch(state, "items", lessonKey(lesson), { visits: [...visits, { date: today, rating, marks }], marks: {} }, nowMs);
};

// Only today's visit can be re-rated.
export const rerateLesson = (state, lesson, rating, today, nowMs) => {
  const { visits = [] } = lessonOf(state, lesson);
  if (visits.at(-1)?.date !== today) return state;
  return touch(state, "items", lessonKey(lesson), { visits: [...visits.slice(0, -1), { ...visits.at(-1), rating }] }, nowMs);
};

export const setDay = (state, day, patch, nowMs) => touch(state, "days", day, patch, nowMs);

export const setStory = (state, id, patch, nowMs) => touch(state, "stories", id, patch, nowMs);

// Delete and Undo send only the mark: the story's text stays, so Undo (here or on another device) brings it back.
export const setStoryDeleted = (state, id, deleted, nowMs) => touch(state, "stories", id, { deleted }, nowMs);

const isObject = (x) => typeof x === "object" && x !== null && !Array.isArray(x);

// Per record, each field keeps the value with the larger time (b on a tie), so a stale device's unrelated write
// can't beat a newer value. Nothing in the app removes a field, so the union never brings back a deleted value.
const mergeRecord = (a, b) => {
  const out = {};
  const ats = {};
  const oldA = byOldCode(a);
  const oldB = byOldCode(b);
  for (const f of new Set([...fieldsOf(a), ...fieldsOf(b)])) {
    const fromB = !(f in a) || (f in b && fieldTime(b, f, oldB) >= fieldTime(a, f, oldA));
    out[f] = (fromB ? b : a)[f];
    ats[f] = fromB ? fieldTime(b, f, oldB) : fieldTime(a, f, oldA);
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
