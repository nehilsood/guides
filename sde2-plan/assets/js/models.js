import { START, DAYS, dayNumber, dateOf, addDays } from "./dates.js";
import { isDue, isCold } from "./srs.js";
import { codeParts } from "./format.js";
import { capMinutes, questionTrack, textKey } from "./wording.js";

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

const ncProblemUrl = (slug) => `https://neetcode.io/problems/${slug}/question`;
const lcProblemUrl = (slug) => `https://leetcode.com/problems/${slug}/`;

const problemView = (problem, state) => {
  const item = state.items["p:" + problem.id] ?? {};
  return {
    id: problem.id,
    title: problem.title,
    difficulty: problem.difficulty,
    ncUrl: ncProblemUrl(problem.ncSlug),
    lcUrl: lcProblemUrl(problem.lcSlug),
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
const LC_PROBLEM = /^https:\/\/leetcode\.com\/problems\/([a-z0-9-]+)/;

// A task that links a NeetCode 250 problem (on either site) shares that problem's ⭐, so a re-solve is one revision
// entry, not two. Its ✓ stays on the task's own record, so ticking a re-solve never un-solves the original.
const taskView = (task, state, problems) => {
  const doneId = "t:" + task.id;
  const own = { doneId, done: state.items[doneId]?.solved === true, cap: capMinutes(task.text), minutes: state.items[doneId]?.minutes ?? null };
  const nc = task.url?.match(NC_PROBLEM)?.[1];
  const lc = task.url?.match(LC_PROBLEM)?.[1];
  const problem = nc ? problems.byNc[nc] : lc ? problems.byLc[lc] : undefined;
  if (!problem) {
    const plain = { ...task, ...own, flagId: doneId, flagged: state.items[doneId]?.flag === true };
    // A LeetCode problem outside the 250 has the same slug on NeetCode; refresh_links.py checks NeetCode's sitemap.
    return lc ? { ...plain, ncUrl: ncProblemUrl(lc), lcUrl: lcProblemUrl(lc) } : plain;
  }
  const view = problemView(problem, state);
  return { ...task, ...own, flagId: "p:" + problem.id, flagged: view.flagged,
    ncUrl: view.ncUrl, lcUrl: view.lcUrl, solutionUrl: view.solutionUrl, videoUrl: view.videoUrl };
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

const blockFromCard = (block, state, problems) => ({
  ...block,
  points: block.points ?? [],
  say: block.say ?? "",
  tasks: (block.tasks ?? []).map((t) => taskView(t, state, problems)),
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
  const label = (id, item) => {
    const [kind, ...rest] = id.split(":");
    const key = rest.join(":");
    if (kind === "p") return problemsById[key]?.title ?? id;
    if (kind === "day") return `Day ${key} · ${outline[Number(key)]?.slots[0]?.topic ?? ""}`;
    if (kind === "q") return typeof item.text === "string" ? `Day ${rest[0]} · ${item.text}` : id;
    return tasks[key] ?? key;
  };
  return flaggedItems(state)
    .filter(([, item]) => !item.srs.graduated)
    .map(([id, item]) => ({
      id,
      label: label(id, item),
      due: item.srs.due,
      step: item.srs.step,
      overdue: item.srs.due < today,
      isDue: item.srs.due <= today,
    }))
    .sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id));
};

// A self-test question, keyed by its full card text so a mark follows the question, not its position.
const questionView = (day, state, { q, a }, shown = q) => {
  const key = `q:${day}:${textKey(q)}`;
  const item = state.items[key] ?? {};
  return { key, q: shown, a, result: item.result ?? null, revising: item.flag === true };
};

const keyed = (day, state) => (block) => {
  const key = `b:${day}:${textKey(block.title)}`;
  return { ...block, key, closed: state.items[key]?.solved === true, questions: [] };
};

// On Day 0 each question sits in the block its prefix names; any it can't place stay in the self-test.
const placeQuestions = (day, blocks, selftest, state) => {
  if (day !== 0) return { blocks, selftest: selftest.map((t) => questionView(day, state, t)) };
  const loose = [];
  const byTrack = new Map(blocks.map((b) => [b.track, b]));
  for (const t of selftest) {
    const found = questionTrack(t.q);
    const block = found && byTrack.get(found.track);
    if (block) block.questions.push(questionView(day, state, t, found.text));
    else loose.push(questionView(day, state, t));
  }
  return { blocks, selftest: loose };
};

const ratedOn = (state, today) => flaggedItems(state).filter(([, item]) => item.srs.history.some((h) => h.date === today)).length;

export const dayModel = (day, outline, cardsByDay, schedule, problemsById, state, today) => {
  if (!Number.isInteger(day) || day < 0 || day > DAYS) {
    return { ok: false, message: `There is no day ${day} — the plan runs from Day 0 to Day ${DAYS}.` };
  }
  const entry = outline[day];
  const card = cardsByDay[day];
  const problemsFor = problemsByTrack(day, entry, schedule, problemsById, state);
  const list = Object.values(problemsById);
  const problems = { byNc: Object.fromEntries(list.map((p) => [p.ncSlug, p])), byLc: Object.fromEntries(list.map((p) => [p.lcSlug, p])) };
  const raw = card ? card.blocks.map((b) => blockFromCard(b, state, problems)) : entry.slots.map(blockFromSlot);
  const { blocks, selftest } = placeQuestions(day, raw.map(keyed(day, state)), card ? card.selftest : [], state);
  const record = state.days[day] ?? {};
  const isToday = day === dayNumber(today);
  const due = reviseModel(state, today, problemsById, outline, cardsByDay).filter((r) => r.isDue);
  const revisedToday = ratedOn(state, today);
  return {
    ok: true,
    day,
    date: entry.date,
    title: card ? card.title : entry.slots.map((s) => s.topic).join(" · "),
    isToday,
    due,
    revisedToday,
    showRevise: isToday && due.length + revisedToday > 0,
    baseline: day === 0,
    blocks: blocks.map((b) => ({ ...b, problems: problemsFor(b.track) })),
    totalMinutes: totalMinutes(blocks.map((b) => ({ minutes: b.minutes ?? 0 }))),
    wholeFlagged: state.items["day:" + day]?.flag === true,
    feelNote: record.feelNote ?? "",
    selftest,
    feel: record.feel ?? null,
    notes: record.notes ?? "",
    done: Boolean(record.done),
    ...(card ? {} : { cardReadyBy: addDays(dateOf(30 * (entry.month - 1) + 1), -7) }),
  };
};
