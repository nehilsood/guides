import { START, DAYS, dayNumber, dateOf, addDays } from "./dates.js";
import { isDue, isCold } from "./srs.js";
import { codeParts } from "./format.js";

const FINISH = dateOf(DAYS);
const DSA_TOTAL = 250;
const NON_STUDY_TRACKS = ["catchup", "checkpoint"];

// A hand-edited progress file may hold a broken srs; such an item is ignored rather than crashing every page.
const wellFormedSrs = (srs) =>
  typeof srs === "object" && srs !== null && Array.isArray(srs.history) && (srs.graduated === true || typeof srs.due === "string");

const flaggedItems = (state) => Object.entries(state.items).filter(([, item]) => item.flag === true && wellFormedSrs(item.srs));

const dueItems = (state, today) => flaggedItems(state).filter(([, item]) => isDue(item.srs, today));

const isDone = (state, day) => Boolean(state.days[day]?.done);

const phaseOf = (todayDay) =>
  todayDay < 0 ? "before" : todayDay === 0 ? "baseline" : todayDay <= DAYS ? "running" : "finished";

const cellStatus = (entry, state, todayDay) => {
  if (entry.day === todayDay) return "today";
  if (entry.day > todayDay) return "future";
  if (isDone(state, entry.day)) return "done";
  return entry.kind === "catchup" ? "catchup" : "missed";
};

const trackTotals = (outline, state) => {
  const tracks = new Map();
  for (const entry of outline.filter((e) => e.day >= 1)) {
    for (const { track } of entry.slots) {
      if (NON_STUDY_TRACKS.includes(track)) continue;
      const t = tracks.get(track) ?? { track, done: 0, total: 0 };
      t.total += 1;
      if (isDone(state, entry.day)) t.done += 1;
      tracks.set(track, t);
    }
  }
  return [...tracks.values()];
};

const dsaProgress = (state) => {
  const problems = Object.entries(state.items).filter(([id]) => id.startsWith("p:"));
  return {
    solved: problems.filter(([, item]) => item.solved === true).length,
    cold: problems.filter(([, item]) => wellFormedSrs(item.srs) && isCold(item.srs)).length,
    total: DSA_TOTAL,
  };
};

const expectedFinish = (days, state, todayDay) => {
  const missed = days.filter((e) => e.day < todayDay && e.kind !== "catchup" && !isDone(state, e.day)).length;
  const catchLeft = days.filter((e) => e.kind === "catchup" && e.day > todayDay).length;
  return missed <= catchLeft ? FINISH : addDays(FINISH, missed - catchLeft);
};

const totalMinutes = (slots) => slots.reduce((sum, s) => sum + s.minutes, 0);

export const homeModel = (outline, state, today) => {
  const todayDay = dayNumber(today);
  const days = outline.filter((e) => e.day >= 1 && e.day <= DAYS);
  const todayEntry = outline[todayDay];
  return {
    todaySummary: todayEntry
      ? { title: todayEntry.slots.map((s) => s.topic).join(" + "), blocks: todayEntry.slots.length, totalMinutes: totalMinutes(todayEntry.slots) }
      : null,
    phase: phaseOf(todayDay),
    daysToStart: dayNumber(START) - todayDay,
    todayDay,
    cells: days.map((e) => ({ day: e.day, date: e.date, status: cellStatus(e, state, todayDay) })),
    tracks: trackTotals(days, state),
    dsa: dsaProgress(state),
    expectedFinish: expectedFinish(days, state, todayDay),
    dueCount: dueItems(state, today).length,
  };
};

const problemView = (problem, state) => {
  const item = state.items["p:" + problem.id] ?? {};
  return {
    id: problem.id,
    title: problem.title,
    difficulty: problem.difficulty,
    ncUrl: `https://neetcode.io/problems/${problem.ncSlug}/question`,
    solutionUrl: `https://neetcode.io/solutions/${problem.lcSlug}`,
    videoUrl: problem.video ? `https://www.youtube.com/watch?v=${problem.video}` : null,
    solved: item.solved === true,
    minutes: item.minutes ?? null,
    flagged: item.flag === true,
  };
};

const problemsByTrack = (day, entry, schedule, problemsById, state) => {
  const all = (schedule[day] ?? []).map((id) => problemsById[id]).filter(Boolean);
  const hasHardBlock = entry.slots.some((s) => s.track === "hard");
  const isHard = (p) => p.difficulty === "Hard";
  const picked = hasHardBlock
    ? { hard: all.filter(isHard), dsa: all.filter((p) => !isHard(p)) }
    : { dsa: all };
  return (track) => (picked[track] ?? []).map((p) => problemView(p, state));
};

const NC_PROBLEM = /^https:\/\/neetcode\.io\/problems\/([a-z0-9-]+)\/question$/;

// A task that links a NeetCode problem shares that problem's ⭐, so a re-solve is one revision entry, not two.
// Its ✓ stays on the task's own record, so ticking a re-solve never un-solves the original.
const taskView = (task, state, problemsBySlug) => {
  const doneId = "t:" + task.id;
  const done = state.items[doneId]?.solved === true;
  const problem = problemsBySlug[task.url?.match(NC_PROBLEM)?.[1]];
  if (!problem) return { ...task, doneId, flagId: doneId, done, flagged: state.items[doneId]?.flag === true };
  const view = problemView(problem, state);
  return { ...task, doneId, flagId: "p:" + problem.id, done, flagged: view.flagged,
    solutionUrl: view.solutionUrl, videoUrl: view.videoUrl };
};

const blockFromSlot = (slot) => ({
  track: slot.track,
  title: slot.topic,
  minutes: slot.minutes,
  points: [],
  say: "",
  tasks: [],
  primary: null,
  extras: [],
  own: [],
});

const blockFromCard = (block, state, problemsBySlug) => ({
  ...block,
  points: block.points ?? [],
  say: block.say ?? "",
  tasks: (block.tasks ?? []).map((t) => taskView(t, state, problemsBySlug)),
  primary: block.primary ?? null,
  extras: block.extras ?? [],
  own: block.own ?? [],
});

// task id -> "Day N · task text", so a ⭐ on a task that is not a NeetCode problem still names it
const taskLabels = (cardsByDay) => {
  const labels = {};
  for (const card of Object.values(cardsByDay))
    for (const block of card.blocks)
      for (const t of block.tasks ?? []) labels[t.id] = `Day ${card.day} · ${codeParts(t.text).map((p) => p.text).join("")}`;
  return labels;
};

export const reviseModel = (state, today, problemsById, outline, cardsByDay = {}) => {
  const tasks = taskLabels(cardsByDay);
  const label = (id) => {
    const [kind, ...rest] = id.split(":");
    const key = rest.join(":");
    if (kind === "p") return problemsById[key]?.title ?? id;
    if (kind === "day") return `Day ${key} · ${outline[Number(key)]?.slots[0]?.topic ?? ""}`;
    return tasks[key] ?? key;
  };
  return flaggedItems(state)
    .filter(([, item]) => !item.srs.graduated)
    .map(([id, item]) => ({
      id,
      label: label(id),
      due: item.srs.due,
      step: item.srs.step,
      overdue: item.srs.due < today,
      isDue: item.srs.due <= today,
    }))
    .sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id));
};

export const dayModel = (day, outline, cardsByDay, schedule, problemsById, state, today) => {
  if (!Number.isInteger(day) || day < 0 || day > DAYS) {
    return { ok: false, message: `There is no day ${day} — the plan runs from Day 0 to Day ${DAYS}.` };
  }
  const entry = outline[day];
  const card = cardsByDay[day];
  const problemsFor = problemsByTrack(day, entry, schedule, problemsById, state);
  const problemsBySlug = Object.fromEntries(Object.values(problemsById).map((p) => [p.ncSlug, p]));
  const blocks = card ? card.blocks.map((b) => blockFromCard(b, state, problemsBySlug)) : entry.slots.map(blockFromSlot);
  const record = state.days[day] ?? {};
  return {
    ok: true,
    day,
    date: entry.date,
    title: card ? card.title : entry.slots.map((s) => s.topic).join(" · "),
    isToday: day === dayNumber(today),
    due: reviseModel(state, today, problemsById, outline, cardsByDay).filter((r) => r.isDue),
    blocks: blocks.map((b) => ({ ...b, problems: problemsFor(b.track) })),
    totalMinutes: totalMinutes(blocks.map((b) => ({ minutes: b.minutes ?? 0 }))),
    wholeFlagged: state.items["day:" + day]?.flag === true,
    feelNote: record.feelNote ?? "",
    selftest: card ? card.selftest : [],
    feel: record.feel ?? null,
    notes: record.notes ?? "",
    done: Boolean(record.done),
    ...(card ? {} : { cardReadyBy: addDays(dateOf(30 * (entry.month - 1) + 1), -7) }),
  };
};
