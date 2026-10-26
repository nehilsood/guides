import { START } from "../dates.js";
import { homeModel } from "../models.js";
import { el, getState, loadData, renderHeader, showError, guarded, onExternalChange, today, longDate, trackLabel, formatHours } from "./common.js";

const SHOWN = ["hld", "lld", "ai", "cs"];
const LEGEND = [["done", "done"], ["missed", "missed"], ["today", "today"], ["catchup", "catch-up day"], ["future", "to come"]];

// style.width goes through the CSSOM, which a style-src 'self' policy allows (a style attribute would not be)
const fill = (percent) => {
  const node = el("span");
  node.style.width = `${percent}%`;
  return node;
};

const bar = (label, done, total, note) =>
  el(
    "div",
    { class: "row" },
    el("span", { class: "row-label", text: label }),
    el("span", { class: "bar" }, fill(total ? Math.round((100 * done) / total) : 0)),
    el("span", { class: "row-note", text: note ?? `${done}/${total}` }),
  );

const grid = (cells) => {
  const rows = [];
  for (let m = 0; m < 6; m++) {
    rows.push(
      el(
        "div",
        { class: "grid" },
        cells.slice(m * 30, m * 30 + 30).map((c) =>
          el("a", { class: `cell ${c.status}`, href: `day.html?d=${c.day}`, title: `Day ${c.day} · ${longDate(c.date)}`, "aria-label": `Day ${c.day}, ${c.status}` }),
        ),
      ),
    );
  }
  return rows;
};

const todayBox = (model) => {
  if (model.phase === "before") {
    return el(
      "div",
      { class: "box today-box" },
      el("div", {}, el("b", { text: `Starts in ${model.daysToStart} day${model.daysToStart === 1 ? "" : "s"}, ${longDate(START)}` }), el("div", { class: "small", text: "Day 0 is a short baseline you can do any time before." })),
      el("a", { class: "button", href: "day.html?d=0", text: "Open Day 0 →" }),
    );
  }
  if (model.phase === "finished") {
    return el("div", { class: "box today-box" }, el("b", { text: "The 180 days are finished. Well done." }), el("a", { class: "button", href: "day.html?d=180", text: "Open Day 180 →" }));
  }
  const summary = model.todaySummary;
  return el(
    "div",
    { class: "box today-box" },
    el(
      "div",
      {},
      el("b", { text: `Day ${model.todayDay} · ${summary.title}` }),
      el("div", { class: "small", text: [`${summary.blocks} block${summary.blocks === 1 ? "" : "s"}`, formatHours(summary.totalMinutes)].filter(Boolean).join(" · ") }),
    ),
    el("a", { class: "button", href: "day.html", text: "Start today →" }),
  );
};

const render = ({ outline }) => {
  const model = homeModel(outline, getState(), today());
  const counts = (s) => model.cells.filter((c) => c.status === s).length;
  const headline = model.phase === "running" ? `${longDate(today())} · Day ${model.todayDay} of 180` : "Your 180 days";
  return el(
    "div",
    {},
    el("h1", { text: headline }),
    todayBox(model),
    el("h2", { text: "Your 180 days" }),
    el("div", { class: "grids" }, grid(model.cells)),
    el("div", { class: "legend" }, LEGEND.map(([cls, text]) => el("span", {}, el("i", { class: `cell ${cls}` }), text))),
    el("p", { class: "small", text: `One row is one month. ${counts("done")} done, ${counts("missed")} missed. On track to finish ${longDate(model.expectedFinish)}.` }),
    el(
      "div",
      { class: "box" },
      el("h2", { text: "Progress" }),
      bar("DSA", model.dsa.solved, model.dsa.total, `${model.dsa.solved}/${model.dsa.total}${model.dsa.cold ? ` · ${model.dsa.cold} cold` : ""}`),
      model.tracks.filter((t) => SHOWN.includes(t.track)).map((t) => bar(trackLabel(t.track), t.done, t.total)),
    ),
    el(
      "div",
      { class: "box due-link" },
      el("span", {}, "⭐ ", el("b", { text: `${model.dueCount} item${model.dueCount === 1 ? "" : "s"} due for revision` })),
      el("a", { href: "revise.html", text: "Open list →" }),
    ),
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
