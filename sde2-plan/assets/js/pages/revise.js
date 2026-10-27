import { reviseModel } from "../models.js";
import { el, getState, commit, loadData, renderHeader, showError, guarded, today, now, rerender, onExternalChange, reviseRow, longDate } from "./common.js";
import { rate } from "../store.js";

const HOW =
  "Nothing to revise yet. Tap the bookmark on a problem, a task or a whole day, or mark a self-test question Missed, and it comes back here.";

const group = (title, rows, onRate) =>
  el("section", { class: "revise-group" }, el("h2", { text: `${title} (${rows.length})` }), rows.map((r) => reviseRow(r, onRate)));

const build = (data, onRate) => {
  const list = reviseModel(getState(), today(), data.problemsById, data.outline, data.cardsByDay);
  const due = list.filter((r) => r.isDue);
  const later = list.filter((r) => !r.isDue);
  return el(
    "div",
    {},
    el("h1", { class: "revise-h", tabindex: "-1", text: "Revise" }),
    !list.length ? el("p", { class: "empty", text: HOW }) : null,
    list.length > 0 && !due.length ? el("p", { class: "empty", text: `Nothing due today. The next one comes back on ${longDate(later[0].due)}.` }) : null,
    due.length ? group("Due today", due, onRate) : null,
    due.length ? el("p", { class: "small", text: "Easy brings it back later. Struggled brings it back sooner." }) : null,
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
