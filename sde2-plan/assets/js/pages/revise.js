import { dayNumber } from "../dates.js";
import { reviseModel } from "../models.js";
import { lessonName, lessonQueue, nextVisit } from "../lessons.js";
import { el, getState, commit, loadData, renderHeader, showError, guarded, today, now, rerender, onExternalChange, dueRow, reviseRow, longDate } from "./common.js";
import { rate } from "../store.js";

const HOW =
  "Nothing to revise yet. Tap the bookmark on a problem, a task or a whole day, mark a self-test question Missed, or finish a lesson's reading, and it comes back here.";

const byDue = (a, b) => a.due.localeCompare(b.due);

// A lesson visit is done on its card on the day page, so here it takes no rating: a due one links to Today.
const lessonRow = (v) =>
  dueRow(v, v.name, `lesson visit #${v.n}`, v.isDue ? el("a", { class: "more", href: "day.html", "aria-label": `Open ${v.name} on Today`, text: "Open on Today" }) : null);

const group = (title, rows, onRate) =>
  el("section", { class: "revise-group" }, el("h2", { text: `${title} (${rows.length})` }), rows.map((r) => (r.lesson ? lessonRow(r) : reviseRow(r, onRate))));

const waitingLine = (n) =>
  n === 1 ? "1 more lesson visit is waiting; it comes up on the next days." : `${n} more lesson visits are waiting; they come up on the next days.`;

const build = (data, onRate) => {
  const state = getState();
  const date = today();
  const list = reviseModel(state, date, data.problemsById, data.outline, data.cardsByDay);
  // Lesson visits are done on Today's page, which only has them on a plan day (as Home counts them).
  const visits = data.outline[dayNumber(date)] ? lessonQueue(state, date) : { today: [], waiting: [], later: [] };
  // "<label> · <title>", or the bare label for a lesson the index has no title for.
  const name = (lesson) => {
    const { label, title } = lessonName(lesson, data.lessonIndex);
    return title === label ? label : `${label} · ${title}`;
  };
  const lessons = (vs, isDue) => vs.map((v) => ({ ...v, name: name(v.lesson), isDue }));
  // A visit rated today is done: like a rated problem, it moves to Coming up with its next date.
  const rated = visits.today.filter((v) => v.rated).map((v) => nextVisit(v.lesson, state.items["l:" + v.lesson])).filter(Boolean);
  const due = [...list.filter((r) => r.isDue), ...lessons(visits.today.filter((v) => !v.rated), true)].sort(byDue);
  const later = [...list.filter((r) => !r.isDue), ...lessons([...visits.later, ...rated], false)].sort(byDue);
  const waiting = visits.waiting.length;
  return el(
    "div",
    {},
    el("h1", { class: "revise-h", tabindex: "-1", text: "Revise" }),
    !due.length && !later.length && !waiting ? el("p", { class: "empty", text: HOW }) : null,
    !due.length && (later.length || waiting)
      ? el("p", { class: "empty", text: waiting ? "Nothing due today." : `Nothing due today. The next one comes back on ${longDate(later[0].due)}.` })
      : null,
    due.length ? group("Due today", due, onRate) : null,
    due.some((r) => !r.lesson) ? el("p", { class: "small", text: "Easy brings it back later. Struggled brings it back sooner." }) : null,
    waiting ? el("p", { class: "small", text: waitingLine(waiting) }) : null,
    later.length ? group("Coming up", later, onRate) : null,
  );
};

renderHeader("revise.html");
loadData()
  .then((data) => {
    const root = document.getElementById("app");
    const draw = guarded(() => rerender(root, () => build(data, onRate)));
    const onRate = (id, rating) => {
      const at = [...root.querySelectorAll(".due .seg")].findIndex((seg) => seg.contains(document.activeElement));
      commit((s) => rate(s, id, rating, today(), now()));
      draw();
      if (at < 0 || root.contains(document.activeElement)) return;
      // The rated row's buttons are gone: keyboard focus moves on to the next due row, or to the heading.
      const segs = root.querySelectorAll(".due .seg");
      if (segs.length) segs[Math.min(at, segs.length - 1)].querySelector("button")?.focus({ preventScroll: true });
      else root.querySelector(".revise-h")?.focus();
    };
    onExternalChange(draw);
    draw();
  })
  .catch(showError);
