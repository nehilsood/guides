// A day as an ordered list of rows (revise, blocks, self-test, close), with progress, the current row and
// what to do next. Pure: the day page draws it, the tests check it.

import { subjectOf } from "./subjects.js";

const MAX_LABEL = 48;
const FOLD_DELAY = 450;

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// "Write `max_average(nums, k)`: the highest…" -> "Write max_average(nums, k)"
export const shortLabel = (text) => {
  const plain = text.replaceAll("`", "");
  const cut = Math.min(...[" · ", ": ", ". "].map((sep) => plain.indexOf(sep)).filter((i) => i >= 0), plain.length);
  const label = plain.slice(0, cut).trim();
  return label.length > MAX_LABEL ? label.slice(0, MAX_LABEL - 1) + "…" : label;
};

const counted = (row, ticked, total, done) => ({ subject: "gen", ...row, ticked, total, done, progress: total ? ticked / total : done ? 1 : 0 });

const reviseRow = (m) => {
  const n = m.due.length + m.revisedToday;
  return counted({ key: "revise", kind: "revise", title: `Revise ${plural(n, "item")}`, minutes: null }, m.revisedToday, n, m.due.length === 0);
};

const SCORE = { got: 1, partly: 0.5 };

const blockRow = (b) => {
  const open = [
    ...b.problems.filter((p) => !p.solved).map((p) => p.title),
    ...b.tasks.filter((t) => !t.done).map((t) => shortLabel(t.text)),
    ...b.questions.filter((q) => q.result === null).map((q) => shortLabel(q.q)),
  ];
  const total = b.problems.length + b.tasks.length + b.questions.length;
  const ticked = total - open.length;
  const row = counted(
    { key: b.key, kind: "block", title: b.title, track: b.track, subject: subjectOf(b.track), minutes: b.minutes ?? 0, nextLabel: open[0] },
    ticked,
    total,
    b.closed || (total > 0 && ticked === total),
  );
  if (!b.questions.length) return row;
  return { ...row, score: { got: b.questions.reduce((s, q) => s + (SCORE[q.result] ?? 0), 0), of: b.questions.length } };
};

const selftestRow = (m) => {
  const open = m.selftest.filter((q) => q.result === null);
  const n = m.selftest.length;
  const row = counted({ key: "selftest", kind: "selftest", title: `Self-test, ${plural(n, "question")}`, minutes: null }, n - open.length, n, open.length === 0);
  return { ...row, nextLabel: open[0] && shortLabel(open[0].q) };
};

const closeRow = (m) => counted({ key: "close", kind: "close", title: "Close the day", minutes: null }, 0, 0, m.done);

export const dayFlow = (m) => {
  const rows = [
    m.showRevise ? reviseRow(m) : null,
    ...m.blocks.map(blockRow),
    m.selftest.length ? selftestRow(m) : null,
    closeRow(m),
  ].filter(Boolean);
  const blocks = rows.filter((r) => r.kind === "block");
  const current = rows.find((r) => !r.done) ?? null;
  const subjects = new Map();
  for (const r of blocks) subjects.set(r.subject, (subjects.get(r.subject) ?? 0) + r.minutes);
  return {
    rows: rows.map(({ nextLabel, ...row }) => row),
    current: current?.key ?? null,
    minutesDone: blocks.reduce((s, r) => s + (r.done ? r.minutes : Math.round(r.minutes * r.progress)), 0),
    totalMinutes: blocks.reduce((s, r) => s + r.minutes, 0),
    next: current ? current.nextLabel ?? current.title : null,
    done: rows.at(-1).done,
    subjects: [...subjects].map(([subject, minutes]) => ({ subject, minutes })),
  };
};

const doneIn = (flow, key) => flow.rows.find((r) => r.key === key)?.done === true;

// Which row is open after a change: the current one on first draw; none, after a beat, when the day just
// finished; the next one, after a beat, when the row the reader had open just finished; otherwise whatever the
// reader chose (including none). Only the reader's own changes (`local`) move rows; a sync never does.
export const afterChange = (before, after, open, local = true) => {
  if (before === null) return { open: open ?? after.current, delay: 0 };
  if (!local) return { open, delay: 0 };
  if (!before.done && after.done) return { open: null, delay: FOLD_DELAY };
  if (open !== null && !doneIn(before, open) && doneIn(after, open)) return { open: after.current, delay: FOLD_DELAY };
  return { open, delay: 0 };
};
