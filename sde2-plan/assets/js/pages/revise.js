import { reviseModel } from "../models.js";
import { el, getState, commit, loadData, renderHeader, showError, guarded, today, now, rerender, onExternalChange, ratingButtons, reviseTag, longDate } from "./common.js";
import { rate } from "../store.js";

const item = (r, onRate) =>
  el(
    "div",
    { class: "prob" },
    el("span", {}, `${r.label} `, el("span", { class: `tag${r.overdue ? " warn" : ""}`, text: reviseTag(r.id, r.step) }), el("span", { class: "small", text: r.isDue ? ` · due ${r.overdue ? "since " : ""}${longDate(r.due)}` : ` · ${longDate(r.due)}` })),
    r.isDue ? ratingButtons(r.id, r.label, onRate) : null,
  );

const build = (data, onRate) => {
  const list = reviseModel(getState(), today(), data.problemsById, data.outline, data.cardsByDay);
  const due = list.filter((r) => r.isDue);
  const later = list.filter((r) => !r.isDue);
  return el(
    "div",
    {},
    el("h1", { text: "Revise" }),
    el(
      "div",
      { class: "box" },
      el("h2", { text: `Due today (${due.length})` }),
      due.length ? due.map((r) => item(r, onRate)) : el("p", { class: "empty", text: "Nothing due. Bookmark a problem or a day for revision and it comes back here." }),
      due.length ? el("p", { class: "small", text: "Easy brings it back later. Struggled brings it back sooner." }) : null,
    ),
    later.length ? el("div", { class: "box" }, el("h2", { text: `Coming up (${later.length})` }), later.map((r) => item(r, onRate))) : null,
  );
};

renderHeader("revise.html");
loadData()
  .then((data) => {
    const root = document.getElementById("app");
    const draw = guarded(() => rerender(root, () => build(data, onRate)));
    const onRate = (id, rating) => {
      commit((s) => rate(s, id, rating, today(), now()));
      draw();
    };
    onExternalChange(draw);
    draw();
  })
  .catch(showError);
