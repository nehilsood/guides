import { DAYS } from "../dates.js";
import { dayModel } from "../models.js";
import { setSolved, setFlag, rate, setDay } from "../store.js";
import { el, getState, commit, loadData, renderHeader, showError, guarded, today, now, rerender, onExternalChange, debounced, flushPending, safeHref, formatViews, formatHours, codeParts, longDate, trackLabel, todayDayClamped, ratingButtons, reviseTag } from "./common.js";

const FEELS = [["light", "Too light"], ["right", "About right"], ["heavy", "Too heavy"]];

const requestedDay = () => {
  const d = new URLSearchParams(location.search).get("d");
  return d === null ? todayDayClamped() : d.trim() === "" ? NaN : Number(d);
};

// A day.html with no ?d= keeps the day it opened on until reload, even across midnight.
const day = requestedDay();

const ext = (url, content) => {
  const href = safeHref(url);
  return href ? el("a", { href, target: "_blank", rel: "noopener" }, content) : content;
};

// Card text with `backticked` code shown as <code>; plain() drops the backticks for labels.
const rich = (text) => codeParts(text).map((p) => (p.code ? el("code", { text: p.text }) : p.text));
const plain = (text) => codeParts(text).map((p) => p.text).join("");

const resource = (item) =>
  el("div", { class: "res" }, item.kind === "video" ? "▶ " : "📄 ", ext(item.url, `${item.title}\u00a0↗`), el("span", { class: "small", text: ` · ${[item.source, item.views != null ? formatViews(item.views) : null].filter(Boolean).join(" · ")}` }));

const flagButton = (id, flagged, mutate, ariaLabel, text = "⭐ Revise") =>
  el("button", { type: "button", class: `btn${flagged ? " on" : ""}`, "aria-pressed": String(flagged), "aria-label": ariaLabel, onclick: () => mutate((s) => setFlag(s, id, s.items[id]?.flag !== true, today(), now())), text });

const chip = (url, text) => {
  const href = safeHref(url);
  return href && el("a", { class: "btn", href, target: "_blank", rel: "noopener", text });
};

const solutionLinks = (x) => [x.solutionUrl && chip(x.solutionUrl, "Solution\u00a0↗"), x.videoUrl && chip(x.videoUrl, "▶ Video\u00a0↗")];

// The ✓ button is the row's checkbox; its word stays in the accessible name.
const checkButton = (on, label, ariaLabel, onclick) =>
  el("button", { type: "button", class: `btn check${on ? " on" : ""}`, "aria-pressed": String(on), "aria-label": ariaLabel, onclick }, "✓", label && el("span", { class: "sr-only", text: ` ${label}` }));

const problem = (p, mutate) => {
  const id = "p:" + p.id;
  const minutes = el("input", { class: "mins", type: "number", min: "0", inputmode: "numeric", placeholder: "⏱ min", "aria-label": `Minutes taken on ${p.title}`, value: p.minutes ?? "" });
  // Tapping ✓ with an empty box keeps the minutes already saved (they may have come from another device).
  const minutesFor = (s) => (minutes.value === "" ? s.items[id]?.minutes ?? null : Number(minutes.value));
  // Emptying the box on purpose clears the minutes. Saved without a re-render: a re-render on blur would
  // replace the button the reader is clicking.
  const saveMinutes = debounced(() => commit((s) => setSolved(s, id, s.items[id]?.solved === true, minutes.value === "" ? null : Number(minutes.value), now())), 500);
  minutes.addEventListener("input", saveMinutes);
  minutes.addEventListener("blur", flushPending);
  return el(
    "div",
    { class: `prob problem${p.solved ? " done" : ""}` },
    el("span", {}, ext(p.ncUrl, p.title), el("span", { class: `tag ${p.difficulty.toLowerCase()}`, text: p.difficulty })),
    el(
      "span",
      { class: "btns" },
      checkButton(p.solved, "Solved", undefined, () => mutate((s) => setSolved(s, id, s.items[id]?.solved !== true, minutesFor(s), now()))),
      el("span", { class: "links" }, chip(p.ncUrl, "NeetCode\u00a0↗"), solutionLinks(p)),
      minutes,
      flagButton(id, p.flagged, mutate, `Revise ${p.title}`),
    ),
  );
};

const task = (t, mutate) => {
  return el(
    "div",
    { class: `prob task${t.done ? " done" : ""}` },
    el("span", {}, ext(t.url, rich(t.text))),
    el(
      "span",
      { class: "btns" },
      checkButton(t.done, null, `Mark task done: ${plain(t.text)}`, () => mutate((s) => setSolved(s, t.doneId, s.items[t.doneId]?.solved !== true, null, now()))),
      el("span", { class: "links" }, solutionLinks(t), flagButton(t.flagId, t.flagged, mutate, `Revise ${plain(t.text)}`)),
    ),
  );
};

const ownLink = (own) => {
  const href = safeHref(own.href, /^\.\.\//);
  return href ? el("a", { href, text: own.title }) : own.title;
};

const block = (b, n, mutate) => {
  const k = `d${day}b${n}`;
  return el(
    "section",
    { class: "box block" },
    el("div", { class: "box-h" }, el("h2", {}, el("span", { class: "kicker", text: `${n} · ${trackLabel(b.track)}` }), el("span", { class: "sr-only", text: " — " }), el("span", { class: "title", text: b.title }), b.minutes ? el("span", { class: "tag", text: `≈${b.minutes} min` }) : null)),
    b.builds_on ? el("p", { class: "small", text: `Builds on: ${b.builds_on}` }) : null,
    b.points.length ? [el("b", { text: "In plain words" }), el("ul", {}, b.points.map((p) => el("li", {}, rich(p))))] : null,
    b.example?.length ? el("details", { "data-k": `${k}ex` }, el("summary", { text: "Worked example" }), el("ol", {}, b.example.map((s) => el("li", {}, rich(s))))) : null,
    b.say ? el("div", { class: "say" }, el("b", { text: "Say it: " }), rich(b.say)) : null,
    b.problems.length ? [el("b", { text: "Solve today" }), b.problems.map((p) => problem(p, mutate))] : null,
    b.tasks.length ? [el("b", { text: "Do today" }), b.tasks.map((t) => task(t, mutate))] : null,
    b.primary ? [el("b", { text: "Start here" }), resource(b.primary)] : null,
    b.extras.length ? el("details", { "data-k": `${k}x` }, el("summary", {}, el("b", { text: "Extra (optional)" }), " — watch / read"), b.extras.map(resource)) : null,
    b.own.length ? [el("b", { text: "From my own guides" }), b.own.map((o) => el("div", { class: "res" }, ownLink(o)))] : null,
  );
};

const dueBox = (m, mutate) => {
  if (!m.due.length) return null;
  const onRate = (id, rating) => mutate((s) => rate(s, id, rating, today(), now()));
  return el(
    "section",
    { class: "box" },
    el("h2", { text: "⭐ Due for revision first" }),
    m.due.map((r) => el("div", { class: "prob" }, el("span", {}, `↻ ${r.label} `, el("span", { class: "tag warn", text: reviseTag(r.id, r.step) })), ratingButtons(r.id, r.label, onRate))),
    el("p", { class: "small", text: "Easy → comes back later · Struggled → comes back sooner" }),
  );
};

const notesBox = (m) => {
  const save = debounced((value) => commit((s) => setDay(s, m.day, { notes: value }, now())), 500);
  const area = el("textarea", { rows: "4", placeholder: "Mistakes, tricks, things to remember…", "aria-label": "My notes for today" });
  area.value = m.notes;
  area.addEventListener("input", () => save(area.value));
  area.addEventListener("blur", flushPending);
  return el("section", { class: "box" }, el("h2", { text: "📝 My notes for today" }), area);
};

const feelBox = (m, mutate) => {
  const save = debounced((value) => commit((s) => setDay(s, m.day, { feelNote: value }, now())), 500);
  const note = el("input", { type: "text", class: "feel-note", placeholder: "Anything to adjust? (optional)", "aria-label": "Note on how the day felt" });
  note.value = m.feelNote;
  note.addEventListener("input", () => save(note.value));
  note.addEventListener("blur", flushPending);
  return el(
    "section",
    { class: "box" },
    el("h2", { text: "How did today feel?" }),
    el("span", { class: "btns" }, FEELS.map(([value, text]) => el("button", { type: "button", class: `btn${m.feel === value ? " on" : ""}`, "aria-pressed": String(m.feel === value), onclick: () => mutate((s) => setDay(s, m.day, { feel: value }, now())), text }))),
    note,
  );
};

const build = (data, mutate) => {
  const m = dayModel(day, data.outline, data.cardsByDay, data.schedule, data.problemsById, getState(), today());
  if (!m.ok) {
    return el("div", { class: "box notice" }, el("h1", { text: "No such day" }), el("p", { text: Number.isNaN(day) ? "That is not a day number. The plan runs from Day 0 to Day 180." : m.message }), el("a", { class: "button", href: "day.html", text: "Go to today" }));
  }
  const nav = el(
    "div",
    { class: "daynav" },
    m.day > 0 ? el("a", { href: `day.html?d=${m.day - 1}`, text: `← Day ${m.day - 1}` }) : el("span"),
    el("span", { class: "small", text: [`Day ${m.day}`, longDate(m.date), formatHours(m.totalMinutes), m.isToday ? "today" : ""].filter(Boolean).join(" · ") }),
    m.day < DAYS ? el("a", { href: `day.html?d=${m.day + 1}`, text: `Day ${m.day + 1} →` }) : el("span"),
  );
  return el(
    "div",
    {},
    nav,
    el("h1", { text: m.title }),
    m.cardReadyBy ? el("div", { class: "box notice" }, el("p", {}, `Card ready by ${longDate(m.cardReadyBy)}. The outline and the DSA problems are below.`)) : null,
    dueBox(m, mutate),
    m.blocks.map((b, i) => block(b, i + 1, mutate)),
    m.selftest.length
      ? el("section", { class: "box selftest" }, el("h2", { text: "Self-test (tap to see the answer)" }), m.selftest.map((t, i) => el("details", { "data-k": `d${m.day}q${i}` }, el("summary", {}, rich(t.q)), el("div", { class: "answer" }, rich(t.a)))))
      : null,
    feelBox(m, mutate),
    notesBox(m),
    el(
      "div",
      { class: "actions" },
      el("button", { type: "button", class: `button${m.done ? " on" : ""}`, "aria-pressed": String(m.done), onclick: () => mutate((s) => setDay(s, m.day, { done: !s.days[m.day]?.done }, now())), text: m.done ? `✓ Day ${m.day} done (tap to undo)` : `✓ Mark day ${m.day} done` }),
      flagButton(`day:${m.day}`, m.wholeFlagged, mutate, "Revise this whole day", "⭐ Revise this whole day"),
    ),
  );
};

renderHeader("day.html");
loadData()
  .then((data) => {
    const root = document.getElementById("app");
    const draw = guarded(() => rerender(root, () => build(data, mutate)));
    const mutate = (mutator) => {
      commit(mutator);
      draw();
    };
    onExternalChange(draw);
    draw();
  })
  .catch(showError);
