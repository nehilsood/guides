import { subjectOf } from "../subjects.js";
import { el, loadData, renderHeader, showError, today, longDate, trackLabel } from "./common.js";
import { dayNumber } from "../dates.js";

// One day: the whole row is the link to its page. Each track is named in words, in its subject's colour.
const dayRow = (e, todayDay) => {
  const isToday = e.day === todayDay;
  return el(
    "li",
    {},
    el(
      "a",
      { class: `oday${isToday ? " is-today" : ""}${e.kind === "catchup" ? " is-catchup" : ""}`, href: `day.html?d=${e.day}`, "aria-current": isToday ? "date" : null },
      el("span", { class: "oday-when" }, el("b", { text: `Day ${e.day}` }), el("span", { class: "small", text: longDate(e.date) }), isToday ? el("span", { class: "oday-now", text: "Today" }) : null),
      el("span", { class: "oday-plan" }, e.slots.map((s) => el("span", { class: `s-${subjectOf(s.track)}` }, el("span", { class: "oday-track", text: trackLabel(s.track) }), ` ${s.topic}`))),
    ),
  );
};

const month = (m, entries, hasCards, todayDay) =>
  el(
    "details",
    { class: "month", "data-k": `m${m}`, open: entries.some((e) => e.day === todayDay) || (m === 1 && todayDay < 1) },
    el("summary", {}, el("span", { class: "month-t", text: `Month ${m}` }), el("span", { class: `tag${hasCards ? " good" : ""}`, text: hasCards ? "cards ready" : "cards not written yet" })),
    el("ol", { class: "odays" }, entries.map((e) => dayRow(e, todayDay))),
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
