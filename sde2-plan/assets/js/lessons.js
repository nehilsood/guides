import { addDays, dateOf, dayNumber, DAYS, todayIST } from "./dates.js";
import { MOVES } from "./srs.js";
import { longDate } from "./format.js";
import { fieldTime, setSkipped, setSolved, startLesson } from "./store.js";

export const LESSON_STEPS = [1, 3, 7, 21, 60];
export const VISIT_MINUTES = 5;
export const GUIDES = { sds: "System Design School", ip: "Interview Prep", rm: "Résumé Mastery" };
// The track a lesson takes when the lesson index doesn't give one.
export const DEFAULT_TRACK = { sds: "hld", ip: "ai", rm: "project" };

const LAST = LESSON_STEPS.length - 1;

// "sds-0006" -> "sds", the key of its guide in GUIDES; "SDS 0006"; and with the guide's full name, "System Design School 0006".
const partsOf = (lesson) => lesson.split("-");
export const guideKey = (lesson) => partsOf(lesson)[0];
export const labelOf = (lesson) => {
  const [guide, num] = partsOf(lesson);
  return `${guide.toUpperCase()} ${num}`;
};
export const guideOf = (lesson) => {
  const [guide, num] = partsOf(lesson);
  return `${GUIDES[guide]} ${num}`;
};

// A lesson's label and title from the lesson index; a lesson not in the index uses its label for both.
export const lessonName = (lesson, lessonIndex) => {
  const entry = lessonIndex[lesson] ?? {};
  const label = entry.label ?? labelOf(lesson);
  return { label, title: entry.title ?? label };
};

// Friday and Sunday are the long days. The weekday comes from the UTC date of the string.
export const capFor = (date) => ([0, 5].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) ? 6 : 3);

// Replay `visits` (all of them, or all but today's). A stale device can sync in a later `started` than a saved visit, so the
// earliest of the two is where the replay begins.
const replay = (item, visits) => {
  const begin = [item.started, item.visits?.[0]?.date].filter(Boolean).sort()[0];
  let step = 0;
  let due = addDays(begin, LESSON_STEPS[0]);
  for (const { date, rating } of visits) {
    step = rating in MOVES ? Math.min(step + MOVES[rating], LAST) : 0;
    due = addDays(date, LESSON_STEPS[step]);
  }
  return { step, due };
};

export const schedule = (item) => {
  const { step, due } = replay(item, item.visits ?? []);
  return due > dateOf(DAYS) ? { step, due: null, done: true } : { step, due, done: false };
};

const overdueDays = (due, today) => Math.max(0, dayNumber(today) - dayNumber(due));
const lastOf = (visits) => (visits.length ? { date: visits.at(-1).date, rating: visits.at(-1).rating } : null);

// A visit rated today shows the lesson as it was before that rating.
const toVisit = (lesson, item, today) => {
  const all = item.visits ?? [];
  const rated = all.at(-1)?.date === today;
  const before = rated ? all.slice(0, -1) : all;
  const { step, due } = replay(item, before);
  return { lesson, due, step, overdue: overdueDays(due, today), n: before.length + 1, last: lastOf(before), rated };
};

// After today's rating, the lesson's next visit as tomorrow's later list will show it; null if it has no more in the plan.
export const nextVisit = (lesson, item) => {
  const { step, due, done } = schedule(item);
  const visits = item.visits ?? [];
  return done ? null : { lesson, due, step, overdue: 0, n: visits.length + 1, last: lastOf(visits), rated: false };
};

const byDueStepLesson = (a, b) => a.due.localeCompare(b.due) || a.step - b.step || a.lesson.localeCompare(b.lesson);

export const lessonQueue = (state, today) => {
  const rated = [];
  const due = [];
  const later = [];
  for (const [key, item] of Object.entries(state.items ?? {})) {
    if (!key.startsWith("l:") || !(item.started || item.visits?.length)) continue;
    const lesson = key.slice(2);
    if (item.visits?.at(-1)?.date === today) rated.push(toVisit(lesson, item, today));
    else {
      const next = schedule(item);
      if (!next.done) (next.due <= today ? due : later).push(toVisit(lesson, item, today));
    }
  }
  due.sort(byDueStepLesson);
  later.sort(byDueStepLesson);
  const room = Math.max(0, capFor(today) - rated.length);
  // A rated row keeps its pre-rating due, so rating one never reorders the list.
  return { today: [...rated, ...due.slice(0, room)].sort(byDueStepLesson), waiting: due.slice(room), later };
};

// Reading parts. Labs and rereads have no `part`. A part is closed once it is solved or skipped; closing the last one
// starts revision, whatever the earlier parts are doing. Unticking and ticking again never touch the lesson record.
const taskKey = (task) => `t:${task.id}`;
export const isLastPart = (task) => task.part !== undefined && task.part === task.of;

export const tickPart = (state, task, on, minutes, today, nowMs) => {
  const ticked = setSolved(state, taskKey(task), on, minutes, nowMs);
  return on && isLastPart(task) ? startLesson(ticked, task.lesson, today, nowMs) : ticked;
};

export const skipPart = (state, task, today, nowMs) => {
  const skipped = setSkipped(state, taskKey(task), nowMs);
  return isLastPart(task) ? startLesson(skipped, task.lesson, today, nowMs) : skipped;
};

// When the part was closed: the later of its `solved` and `skipped` fields that are true, timed as the store times a
// field. With no time at all it counts as closed long ago.
const closedAt = (item) => Math.max(0, ...["solved", "skipped"].filter((f) => item[f] === true).map((f) => fieldTime(item, f)));

// Parts from days before `todayDay` that are still open, or were closed today (so the row stays until tomorrow).
export const stillToRead = (cardsByDay, state, today) => {
  const out = [];
  const todayDay = dayNumber(today);
  const days = Object.keys(cardsByDay).map(Number).filter((d) => d < todayDay).sort((a, b) => a - b);
  for (const day of days)
    for (const block of cardsByDay[day].blocks)
      for (const t of block.tasks ?? []) {
        if (t.part === undefined) continue;
        const item = (state.items ?? {})[taskKey(t)] ?? {};
        const closed = item.solved === true || item.skipped === true;
        if (closed && (!closedAt(item) || todayIST(closedAt(item)) !== today)) continue;
        const { id, lesson, part, of, minutes, text, url } = t;
        out.push({ id, lesson, part, of, minutes, text, url, day, closed, solved: item.solved === true, skipped: item.skipped === true });
      }
  return out;
};

// Which questions a visit asks. Each slot is [kinds, count]; SDS has one slot over quiz and probe together.
const slotsOf = (lesson) => {
  if (lesson.startsWith("rm-")) return [[["probe"], 1], [["deep-dive"], 1], [["edges"], 1]];
  if (lesson === "ip-0002") return [[["headline"], 1], [["trap"], 2]];
  if (lesson.startsWith("ip-")) return [[["follow-up"], 3]];
  return [[["quiz", "probe"], 3]];
};

// Within a slot: missed on the last visit first, then least recently asked (never asked first), ties in file order.
// Only completed visits count, and ids no longer in the file are ignored.
const pickSlot = (pool, visits) => {
  const lastAsked = (q) => visits.findLastIndex((v) => q.id in (v.marks ?? {}));
  const missed = new Set(Object.keys(visits.at(-1)?.marks ?? {}).filter((id) => visits.at(-1).marks[id] === "missed"));
  const rank = (q) => [missed.has(q.id) ? 0 : 1, lastAsked(q)];
  return pool
    .map((q, i) => ({ q, i, r: rank(q) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.i - b.i)
    .map(({ q }) => ({ ...q, missedLast: missed.has(q.id) }));
};

// A visit rated today is picked as if it hadn't happened, like toVisit.
export const pickQuestions = (file, item, today) => {
  const all = item?.visits ?? [];
  const visits = all.at(-1)?.date === today ? all.slice(0, -1) : all;
  return slotsOf(file.lesson).flatMap(([kinds, count]) =>
    pickSlot(file.questions.filter((q) => kinds.includes(q.kind)), visits).slice(0, count));
};

// The marks of the visit on screen: today's rated visit keeps its own, otherwise the ones in progress.
export const visitMarks = (item, today) => {
  const last = item?.visits?.at(-1);
  return last?.date === today ? last.marks ?? {} : item?.marks ?? {};
};

// `step` is the first question with no mark, so a visit resumes where it stopped.
export const visitProgress = (questions, marks = {}) => {
  const first = questions.findIndex((q) => !(q.id in marks));
  return {
    step: first < 0 ? questions.length : first,
    got: questions.filter((q) => marks[q.id] === "got").length,
    done: first < 0,
  };
};

// The card's wording.
export const RATING_WORD = { easy: "Easy", ok: "OK", struggled: "Struggled" };

const ordinal = (n) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
};

// The line under a lesson row's guide: which visit this is, and when it was read or last seen.
export const visitLine = ({ n, last, item }) =>
  last ? `${ordinal(n)} visit. Last seen ${longDate(last.date)}, rated ${RATING_WORD[last.rating]}.`
  : `${ordinal(n)} visit.${item.started ? ` Read on ${longDate(item.started)}.` : ""}`;

export const rateHint = (got) =>
  got === 3 ? "All 3 usually means Easy." : got === 2 ? "2 of 3 usually means OK." : "1 or none usually means Struggled: it comes back tomorrow.";

// When a lesson just rated today comes back, from its schedule after that rating.
export const backNote = (item, today) => {
  const { due, done } = schedule(item);
  if (done) return "That was its last visit in the plan.";
  const days = dayNumber(due) - dayNumber(today);
  return days === 1 ? "Back tomorrow." : `Back in ${days} days, ${longDate(due)}.`;
};

// The 3-part bar in words, for a screen reader.
export const barText = (questions, marks) => {
  const count = (result) => questions.filter((q) => marks[q.id] === result).length;
  const got = count("got");
  const missed = count("missed");
  return `${got} got, ${missed} missed, ${questions.length - got - missed} to go`;
};
