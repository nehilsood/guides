import { DAYS } from "../dates.js";
import { homeModel, dayModel } from "../models.js";
import { dayFlow } from "../dayflow.js";
import { icon } from "./icons.js";
import { SUBJECTS, subjectOf } from "../subjects.js";
import { el, getState, loadData, renderHeader, showError, guarded, onExternalChange, today, todayDayClamped, longDate, fullDate, plain, sentence, barParts } from "./common.js";

const SHOWN = ["hld", "lld", "ai", "cs"];
const LEGEND = [["done", "done"], ["today", "today"], ["missed", "missed"], ["catchup", "catch-up day"]];

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const dayMonth = (dateStr) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(dateStr + "T00:00:00Z"));

// style.width goes through the CSSOM, which a style-src 'self' policy allows (a style attribute would not be)
const fill = (percent) => {
  const node = el("span");
  node.style.width = `${percent}%`;
  return node;
};

// One subject's progress, in its colour.
const bar = (track, done, total, note) =>
  el(
    "div",
    { class: `track-row s-${subjectOf(track)}` },
    el("span", { class: "track-label", text: SUBJECTS[subjectOf(track)] }),
    el("span", { class: "bar" }, fill(total ? Math.round((100 * done) / total) : 0)),
    el("span", { class: "track-note", text: note ?? `${done}/${total}` }),
  );

const heading = (m) =>
  m.phase === "running" ? `Day ${m.todayDay} of ${DAYS}`
  : m.phase === "finished" ? `${DAYS} days done`
  : m.daysToStart === 1 ? "Starts tomorrow"
  : `Starts in ${m.daysToStart} days`;

// The day to do now (Day 0 before the start, Day 180 after the end): how far through it is, and the way in.
const todayCard = (m, d, flow) => {
  const started = flow.minutesDone > 0 || flow.rows.some((r) => r.done);
  const outside = m.phase === "before" || m.phase === "finished";
  const action = outside || flow.done ? `Open Day ${d.day}` : started ? `Continue Day ${d.day}` : `Start Day ${d.day}`;
  return el(
    "section",
    { class: "panel today-card", "aria-labelledby": "today-t" },
    el("h2", { id: "today-t", class: "today-t", text: plain(d.title) }),
    el("p", { class: "day-meta" }, el("b", { text: `${flow.minutesDone} of ${flow.totalMinutes} minutes` }), flow.done ? ` done. Day ${d.day} done.` : ` done. Next: ${sentence(plain(flow.next))}`),
    el("span", { class: "daybar mini", "aria-hidden": "true" }, barParts(flow, false, "mini")),
    el("a", { class: "button wide", href: `day.html?d=${d.day}`, text: action }),
  );
};

// One month as a picture of its 30 days. With a mouse a cell opens its day; on a touch screen the cells are too small
// to tap, so plan.css turns them off there and the Today card and the outline are the ways in. The cells stay out of
// the tab order, and a screen reader hears the month's summary instead.
const monthRow = (cells, i) => {
  const n = (status) => cells.filter((c) => c.status === status).length;
  const now = cells.find((c) => c.status === "today");
  const summary = [`Month ${i + 1}, Days ${cells[0].day} to ${cells.at(-1).day}`, `${n("done")} done`, `${n("missed")} missed`, now && `today is Day ${now.day}`];
  return el(
    "div",
    { class: "map-row", role: "img", "aria-label": summary.filter(Boolean).join(", ") },
    el("span", { class: "map-m", text: String(i + 1) }),
    el("span", { class: "grid" }, cells.map((c) => el("a", { class: `cell ${c.status}`, href: `day.html?d=${c.day}`, tabindex: "-1", title: `Day ${c.day} · ${longDate(c.date)}` }))),
  );
};

const map = (m) => [
  el("div", { class: "map-h" }, el("h2", { text: `Your ${DAYS} days` }), el("a", { class: "more", href: "outline.html", text: "Every day in the outline" })),
  el("div", { class: "map" }, m.months.map(monthRow)),
  el("div", { class: "legend" }, LEGEND.map(([cls, text]) => el("span", {}, el("i", { class: `cell ${cls}` }), text))),
  el("p", { class: "map-foot", text: `One row is one month. ${m.counts.done} done, ${m.counts.missed} missed.` }),
];

const render = ({ outline, cardsByDay, schedule, problemsById }) => {
  const now = today();
  const m = homeModel(outline, getState(), now);
  const d = dayModel(todayDayClamped(), outline, cardsByDay, schedule, problemsById, getState(), now);
  return el(
    "div",
    {},
    el("h1", { text: heading(m) }),
    el("p", { class: "day-meta" }, m.phase === "finished" ? `${fullDate(now)}.` : `${fullDate(now)}. On track to finish ${dayMonth(m.expectedFinish)}.`),
    todayCard(m, d, dayFlow(d)),
    map(m),
    el("h2", { text: "Progress" }),
    bar("dsa", m.dsa.solved, m.dsa.total, `${m.dsa.solved}/${m.dsa.total}${m.dsa.cold ? ` · ${m.dsa.cold} cold` : ""}`),
    m.tracks.filter((t) => SHOWN.includes(t.track)).map((t) => bar(t.track, t.done, t.total)),
    m.dueCount
      ? [
          el("h2", { text: "Revision" }),
          el("p", { class: "due-link" }, icon("bookmark"), el("b", { text: `${plural(m.dueCount, "item")} due for revision` }), el("a", { class: "more", href: "revise.html", text: "Revise" })),
        ]
      : null,
  );
};

renderHeader("index.html");
loadData()
  .then((data) => {
    const draw = guarded(() => document.getElementById("app").replaceChildren(render(data)));
    onExternalChange(draw);
    draw();
  })
  .catch(showError);
