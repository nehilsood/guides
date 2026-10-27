import { subjectOf } from "../subjects.js";
import { el, loadData, renderHeader, showError, today, longDate, trackLabel } from "./common.js";
import { dayNumber } from "../dates.js";

const month = (m, entries, hasCards, todayDay) =>
  el(
    "details",
    { class: "box", "data-k": `m${m}`, open: entries.some((e) => e.day === todayDay) || (m === 1 && todayDay < 1) },
    el("summary", {}, el("b", { text: `Month ${m}` }), el("span", { class: `tag${hasCards ? " good" : ""}`, text: hasCards ? "cards ready" : "cards not written yet" })),
    el(
      "table",
      { class: "outline" },
      el("thead", {}, el("tr", {}, ["Day", "Date", "Plan"].map((h) => el("th", { text: h })))),
      el(
        "tbody",
        {},
        entries.map((e) =>
          el(
            "tr",
            { class: e.day === todayDay ? "now" : e.kind === "catchup" ? "catchup-row" : "" },
            el("td", {}, el("a", { href: `day.html?d=${e.day}`, text: String(e.day) })),
            el("td", { text: longDate(e.date) }),
            el("td", {}, e.slots.map((s) => el("div", {}, el("span", { class: `tag s-${subjectOf(s.track)}`, text: trackLabel(s.track) }), ` ${s.topic}`))),
          ),
        ),
      ),
    ),
  );

renderHeader("outline.html");
loadData()
  .then(({ outline, cardsByDay }) => {
    const todayDay = dayNumber(today());
    const months = [...new Set(outline.map((e) => e.month))];
    document.getElementById("app").replaceChildren(
      el("h1", { text: "Outline" }),
      el("p", { class: "small", text: "All 180 days at a glance. Day 0 is the baseline." }),
      ...months.map((m) => {
        const entries = outline.filter((e) => e.month === m);
        return month(m, entries, entries.some((e) => cardsByDay[e.day]), todayDay);
      }),
    );
  })
  .catch(showError);
