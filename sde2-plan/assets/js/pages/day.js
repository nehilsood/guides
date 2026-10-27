import { DAYS } from "../dates.js";
import { dayModel } from "../models.js";
import { dayFlow, afterChange } from "../dayflow.js";
import { SUBJECTS } from "../subjects.js";
import { setSolved, setMinutes, setFlag, setResult, setDay, rate, setHelp, showAnswer } from "../store.js";
import { el, busy, getState, commit, loadData, renderHeader, showError, guarded, today, now, rerender, onExternalChange, debounced, flushPending, safeHref, formatViews, codeParts, leadIn, plain, sentence, longDate, fullDate, trackLabel, todayDayClamped, reviseRow, barParts } from "./common.js";
import { icon, ring } from "./icons.js";
import { PROBLEM_CAP, elapsed, start, pause, clear, clock, isOver, toMinutes, runningId, parseRuns } from "../timer.js";

const requestedDay = () => {
  const d = new URLSearchParams(location.search).get("d");
  return d === null ? todayDayClamped() : d.trim() === "" ? NaN : Number(d);
};

// A day.html with no ?d= keeps the day it opened on until reload, even across midnight.
const day = requestedDay();

const FOLD_MS = 450; // --t-fold
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// From this width the open row reads in a column beside the day list instead of inside it.
const wide = matchMedia("(min-width: 1100px)");

// Card text with `backticked` code shown as <code>.
const rich = (text) => codeParts(text).map((p) => (p.code ? el("code", { text: p.text }) : p.text));

const ext = (url, ...content) => {
  const href = safeHref(url);
  return href ? el("a", { class: "ext", href, target: "_blank", rel: "noopener" }, content, icon("external")) : content;
};

const chip = (url, text, name, focusKey) => {
  const href = safeHref(url);
  return href && el("a", { class: "chip", href, target: "_blank", rel: "noopener", "data-f": focusKey }, name && icon(name), text, icon("external"));
};

// Where to solve it (either site), then help. A chip whose link the problem lacks is left out, and Solution and
// Video wait until the problem is ticked or its answer shown; Solution takes the help button's focus key, so
// focus stays put when Show the answer replaces the button with it.
const linkChips = (x) => [chip(x.ncUrl, "NeetCode"), chip(x.lcUrl, "LeetCode"), x.hideAnswer ? null : [chip(x.solutionUrl, "Solution", null, `help-${x.answerId}`), chip(x.videoUrl, "Video", "video")]];

const STEP_TEXT = { idea: "Show the idea", example: "Show the worked example" };

// One button for a coding row's next step of help; the same focus key keeps focus on it from step to step.
// Its accessible name adds the row's name, so a screen reader can tell the rows apart.
const helpButton = (x, name, mutate) => {
  const attrs = (text) => ({ type: "button", class: "link-btn", "data-f": `help-${x.answerId}`, "aria-label": `${text}: ${name}`, text });
  if (x.nextStep) return el("button", { ...attrs(STEP_TEXT[x.nextStep]), onclick: () => mutate((s) => setHelp(s, x.answerId, x.nextStep, now())) });
  return x.canShowAnswer
    ? el("button", { ...attrs("Show the answer"), title: "Shows the Solution and Video, and adds it to revision", onclick: () => mutate((s) => showAnswer(s, x.answerId, x.flagId ?? x.answerId, today(), now())) })
    : null;
};

const resource = (item) =>
  el(
    "div",
    { class: "res" },
    icon(item.kind === "video" ? "video" : "article"),
    el("span", {}, ext(item.url, item.title), el("span", { class: "small", text: ` ${[item.source, item.views != null ? formatViews(item.views) : null].filter(Boolean).join(", ")}` })),
  );

// The checkbox draws its tick; its accessible name says what it marks.
const checkbox = (on, ariaLabel, onclick, focusKey) =>
  el("button", { type: "button", class: `anim check${on ? " is-on" : ""}`, "aria-pressed": String(on), "aria-label": ariaLabel, "data-f": focusKey, "data-k": focusKey, onclick }, el("span", { class: "box-mark" }, icon("check")));

const reviseToggle = (id, flagged, name, mutate) =>
  el(
    "button",
    { type: "button", class: "icon-btn", "aria-pressed": String(flagged), "aria-label": `Revise ${name}`, title: "Add to revision", "data-f": `flag-${id}`, onclick: () => mutate((s) => setFlag(s, id, s.items[id]?.flag !== true, today(), now())) },
    icon("bookmark"),
  );

// Minutes for a problem or a timed task. Ticking with an empty box keeps the minutes already saved (they may
// have come from another device); emptying the box on purpose clears them. Saved without a redraw: a redraw
// on blur would replace the button the reader is clicking.
const minutesBox = (id, minutes, name) => {
  const input = el("input", { class: "mins", type: "number", min: "0", inputmode: "numeric", placeholder: "min", "aria-label": `Minutes taken on ${name}`, value: minutes ?? "" });
  const save = debounced(() => commit((s) => setMinutes(s, id, input.value === "" ? null : Number(input.value), now())), 500);
  input.addEventListener("input", save);
  input.addEventListener("blur", flushPending);
  return { input, edited: () => input.value !== String(minutes ?? ""), minutesFor: (s) => (input.value === "" ? s.items[id]?.minutes ?? null : Number(input.value)) };
};

// Timers: the runs live in page memory, mirrored to sessionStorage so a reload keeps them. Only the final minutes
// are saved to progress, on the tick. `timed` holds each timed row on this day (its cap in minutes, its name and the
// day-list row it sits in), from the day's model. `buzzed` holds the runs already past their cap, so each cues
// once; it is seeded at the first draw, so a reload doesn't cue again.
const TIMERS_KEY = "sde2:v1:timers";
let runs = (() => {
  try {
    return parseRuns(sessionStorage.getItem(TIMERS_KEY));
  } catch {
    return {};
  }
})();
let timed = {};
let buzzed = null;
const keepRuns = (next) => {
  runs = next;
  try {
    sessionStorage.setItem(TIMERS_KEY, JSON.stringify(runs));
  } catch {} // storage blocked: the timers last as long as the page
};
const endRun = (id) => {
  keepRuns(clear(runs, id));
  buzzed.delete(id);
};

// Start or Pause, then the time so far. The time is filled in by paintTimers every second, without a redraw.
const timer = (id, name, redraw) => {
  const on = runs[id]?.since != null;
  const word = on ? "Pause" : "Start";
  return el(
    "span",
    { class: "timer" },
    el("button", { type: "button", class: "btn timer-btn", "data-f": `timer-${id}`, "aria-label": `${word} the timer: ${name}`, onclick: () => (keepRuns(on ? pause(runs, id, now()) : start(runs, id, now())), redraw()) }, icon(on ? "pause" : "play"), word),
    runs[id] ? el("span", { class: "timer-clock", "data-timer": id }) : null,
  );
};

// Ticking a row with a timer on it saves the timer's minutes and ends the run, unless minutes were typed into its
// box since it was drawn: those win (the run ends anyway). Otherwise the typed box, else the minutes already saved.
const tick = (id, box, mutate) => () => {
  const on = getState().items[id]?.solved !== true;
  const run = on ? runs[id] : undefined;
  if (run) endRun(id);
  const timedMinutes = run && !box.edited() ? toMinutes(elapsed(run, now())) : null;
  mutate((s) => setSolved(s, id, on, timedMinutes ?? (box ? box.minutesFor(s) : null), now()));
};

// Checkbox, text and the revise toggle on the first line; links and minutes under the text.
const item = (done, check, text, toggle, tools) =>
  el("div", { class: `item${done ? " is-done" : ""}` }, check, el("div", { class: "item-text" }, text), toggle, el("div", { class: "item-tools" }, tools));

const problem = (p, mutate, redraw) => {
  const id = "p:" + p.id;
  const box = minutesBox(id, p.minutes, p.title);
  return item(
    p.solved,
    checkbox(p.solved, `Solved: ${p.title}`, tick(id, box, mutate), `done-${id}`),
    [ext(p.ncUrl, p.title), el("span", { class: `tag ${p.difficulty.toLowerCase()}`, text: p.difficulty })],
    reviseToggle(id, p.flagged, p.title, mutate),
    [linkChips(p), helpButton(p, p.title, mutate), p.solved ? null : timer(id, p.title, redraw), box.input],
  );
};

const task = (t, mutate, redraw) => {
  const name = plain(t.text);
  const box = t.cap !== null ? minutesBox(t.doneId, t.minutes, name) : null;
  return item(
    t.done,
    checkbox(t.done, `Done: ${name}`, tick(t.doneId, box, mutate), `done-${t.doneId}`),
    ext(t.url, rich(t.text)),
    reviseToggle(t.flagId, t.flagged, name, mutate),
    [linkChips(t), helpButton(t, name, mutate), box && !t.done ? timer(t.doneId, name, redraw) : null, box?.input],
  );
};

const ownLink = (own) => {
  const href = safeHref(own.href, /^\.\.\//);
  return el("div", { class: "res" }, icon("article"), href ? el("a", { href, text: own.title }) : own.title);
};

const group = (title, ...content) => [el("h3", { class: "grp", text: title }), content];

// Things to tick, on their own panel, with a count of how many are done.
const todo = (title, done, items) =>
  el("div", { class: "todo" }, el("h3", { class: "grp" }, title, el("span", { class: "count", text: `${done} of ${items.length} done` })), items);

// "Day 2 · counting with a dict…": the day it names links to that day.
const buildsOn = (text) => {
  const m = text.match(/^Day (\d+)/);
  return el("p", { class: "builds" }, icon("revise"), el("span", {}, "Builds on ", m ? [el("a", { href: `day.html?d=${m[1]}`, text: m[0] }), text.slice(m[0].length)] : text));
};

// A point whose short name comes before a colon shows the name in bold.
const point = (text) => {
  const l = leadIn(text);
  return el("li", {}, l ? [el("b", {}, rich(l.lead)), ": ", rich(l.rest)] : rich(text));
};

const points = (lines) => el("ul", { class: "points" }, lines.map(point));
// One span per step: each li is a two-column grid (number, text), and a bare <code> would take the number's column.
const steps = (lines) => el("ol", { class: "steps" }, lines.map((s) => el("li", {}, el("span", {}, rich(s)))));

// The help a coding row has taken, under the row: none taken, nothing drawn.
const hintPanel = (x) => {
  const idea = x.taken.idea && x.help.idea.length > 0;
  const example = x.taken.example && x.help.example.length > 0;
  return idea || example
    ? el(
        "div",
        { class: "hint" },
        idea ? [el("p", { class: "hint-h", text: "The idea" }), points(x.help.idea)] : null,
        example ? [el("p", { class: "hint-h", text: "Worked example" }), steps(x.help.example)] : null,
      )
    : null;
};

// Once the block is in its debrief, a row's help moves into the debrief's "The idea".
const todos = (b, mutate, redraw) => {
  const rows = (x, drawn) => [drawn, b.debrief ? null : hintPanel(x)];
  return [
    b.problems.length ? todo("Solve today", b.problems.filter((p) => p.solved).length, b.problems.map((p) => rows(p, problem(p, mutate, redraw)))) : null,
    b.tasks.length ? todo("Do today", b.tasks.filter((t) => t.done).length, b.tasks.map((t) => rows(t, task(t, mutate, redraw)))) : null,
  ];
};

const exampleBox = (b) => (b.example?.length ? el("details", { class: "example", "data-k": `${b.key}-ex` }, el("summary", { text: "Worked example" }), steps(b.example)) : null);

const sayBox = (b) => (b.say ? el("div", { class: "say" }, el("p", { class: "say-h", text: "Say it in the interview" }), el("p", {}, rich(b.say))) : null);

const readings = (b, primary) => [
  primary ? group("Start here", el("div", { class: "start" }, resource(primary))) : null,
  b.extras.length ? el("details", { "data-k": `${b.key}-x` }, el("summary", { text: "Extras, if you have time" }), b.extras.map(resource)) : null,
  b.own.length ? group("From my own guides", b.own.map(ownLink)) : null,
];

const tail = (b, r, mutate) => [
  b.questions.length ? group(`${trackLabel(b.track)} ${scoreText(r.score)}`, b.questions.map((q) => question(q, true, mutate))) : null,
  // Ticking everything finishes a block on its own; the button is for leaving one early, or undoing that.
  !r.done || b.closed
    ? el(
        "p",
        { class: "row-end" },
        el("button", { type: "button", class: "btn", "data-f": `close-${b.key}`, onclick: () => mutate((s) => setSolved(s, b.key, !b.closed, null, now())), text: b.closed ? "Reopen this block" : "Done with this block" }),
      )
    : null,
];

// The debrief's idea: the block's points, then each coding item's own hint lines under its name.
const debriefIdea = (b) => {
  const hinted = [...b.problems.map((p) => [p.title, p.slug]), ...b.tasks.filter((t) => t.linked).map((t) => [plain(t.text), t.slug])].filter(([, slug]) => b.hints[slug]?.length);
  return b.points.length || hinted.length
    ? group("The idea", b.points.length ? points(b.points) : null, hinted.map(([title, slug]) => [el("p", {}, el("b", { text: title })), points(b.hints[slug])]))
    : null;
};

// A coding block opens on its problems; its teaching waits for help on a row or for the debrief below them.
const solveFirstBody = (b, r, mutate, redraw) => {
  const early = b.primary?.first ? b.primary : null;
  return [
    b.builds_on ? buildsOn(b.builds_on) : null,
    b.first.length || early ? group("Before you start", b.first.length ? points(b.first) : null, early ? el("div", { class: "start" }, resource(early)) : null) : null,
    b.debrief ? null : el("p", { text: `Restate it with a tiny example, list the edge cases and say the brute force before you code. ${b.track === "checkpoint" ? "Stuck? Use Show the answer on its row." : "Stuck on one? Take the help on its row, one step at a time."}` }),
    todos(b, mutate, redraw),
    b.debrief
      ? [debriefIdea(b), exampleBox(b), sayBox(b), readings(b, early ? null : b.primary)]
      : el("p", {
          class: "small",
          text:
            b.track === "checkpoint"
              ? "The scoring list and what to do next open once you've ticked each problem (solved or not), or with Done with this block."
              : "How to say it and the readings open once you've solved today's problems.",
        }),
    tail(b, r, mutate),
  ];
};

const blockBody = (b, r, mutate, redraw) =>
  b.solveFirst
    ? solveFirstBody(b, r, mutate, redraw)
    : [
        b.builds_on ? buildsOn(b.builds_on) : null,
        b.points.length ? group("In plain words", points(b.points)) : null,
        exampleBox(b),
        sayBox(b),
        todos(b, mutate, redraw),
        readings(b, b.primary),
        tail(b, r, mutate),
      ];

const reviseBody = (m, mutate) => {
  if (!m.due.length) return el("p", { class: "small", text: "All revised for today." });
  const onRate = (id, rating) => mutate((s) => rate(s, id, rating, today(), now()));
  return [
    m.due.map((r) => reviseRow(r, onRate)),
    el("p", { class: "small", text: "Easy brings it back later. Struggled brings it back sooner." }),
  ];
};

// A self-test question: tap to reveal the answer, then mark it. On normal days a Missed question goes into
// revision; Day 0 marks only score the baseline (decision 22).
const MARKS = [["got", "Got it"], ["partly", "Partly"], ["missed", "Missed"]];
const MARK_WORD = Object.fromEntries(MARKS);

const question = (q, baseline, mutate) => {
  const mark = (result) =>
    mutate((s) => {
      const next = setResult(s, q.key, result, q.q, now());
      return !baseline && result === "missed" && next.items[q.key]?.flag !== true ? setFlag(next, q.key, true, today(), now()) : next;
    });
  return el(
    "details",
    { class: "q", "data-k": `q-${q.key}` },
    el("summary", {}, el("span", { class: "q-text" }, rich(q.q)), q.result ? el("span", { class: `tag mark is-${q.result}`, text: MARK_WORD[q.result] }) : null),
    el(
      "div",
      { class: "q-body" },
      el("p", { class: "answer" }, rich(q.a)),
      el(
        "div",
        { class: "seg", role: "group", "aria-label": "How did you do?" },
        MARKS.filter(([value]) => baseline || value !== "partly").map(([value, label]) =>
          el("button", { type: "button", "aria-pressed": String(q.result === value), "data-f": `mark-${q.key}-${value}`, onclick: () => mark(value), text: label }),
        ),
      ),
      !baseline && q.revising
        ? el(
            "p",
            { class: "revising" },
            el("span", { class: "tag", text: "Revising" }),
            el("button", { type: "button", class: "link-btn", "data-f": `unflag-${q.key}`, onclick: () => mutate((s) => setFlag(s, q.key, false, today(), now())), text: "Stop revising" }),
          )
        : null,
    ),
  );
};

const scoreText = ({ got, of }) => `${got} of ${of}`;

const FEELS = [["light", "Too light"], ["right", "About right"], ["heavy", "Too heavy"]];

// A text field that saves as you type (debounced) and at once on blur.
const savedField = (field, value, save) => {
  const commitLater = debounced((v) => commit((s) => save(s, v)), 500);
  field.value = value;
  field.addEventListener("input", () => commitLater(field.value));
  field.addEventListener("blur", flushPending);
  return field;
};

const closeBody = (m, mutate) => [
  el("h3", { class: "grp", text: "How did today feel?" }),
  el(
    "div",
    { class: "seg", role: "group", "aria-label": "How did today feel?" },
    FEELS.map(([value, text]) => el("button", { type: "button", "aria-pressed": String(m.feel === value), "data-f": `feel-${value}`, onclick: () => mutate((s) => setDay(s, m.day, { feel: value }, now())), text })),
  ),
  savedField(el("input", { type: "text", class: "feel-note", placeholder: "Anything to adjust? (optional)", "aria-label": "Note on how the day felt" }), m.feelNote, (s, v) => setDay(s, m.day, { feelNote: v }, now())),
  el("h3", { class: "grp", text: "My notes" }),
  savedField(el("textarea", { rows: "4", placeholder: "Mistakes, tricks, things to remember", "aria-label": "My notes for today" }), m.notes, (s, v) => setDay(s, m.day, { notes: v }, now())),
  el(
    "div",
    { class: "close-actions" },
    el("button", { type: "button", class: m.done ? "btn" : "button", "data-f": "day-done", onclick: () => mutate((s) => setDay(s, m.day, { done: !s.days[m.day]?.done }, now())), text: m.done ? `Mark day ${m.day} not done` : `Mark day ${m.day} done` }),
    el(
      "button",
      { type: "button", class: "btn", "aria-pressed": String(m.wholeFlagged), "data-f": "day-flag", onclick: () => mutate((s) => setFlag(s, `day:${m.day}`, s.items[`day:${m.day}`]?.flag !== true, today(), now())) },
      icon("bookmark"),
      "Revise this whole day",
    ),
  ),
];

// Page memory: which row is open, and the flow it was drawn from (to spot a row that just finished).
let open = null;
let lastFlow = null;
let advance = null;
// Set by the reader's own change, so the next draw may move rows; a sync redraw leaves them where they are.
let local = false;
// When the day is marked done, the bar's sweep waits until the reader is back at the top to see it.
let sweepPending = false;

const row = (r, isCurrent, body, onToggle) => {
  const isOpen = r.key === open;
  const state = [isOpen && "is-open", isCurrent && "is-current", r.done && "is-done"].filter(Boolean).join(" ");
  return el(
    "section",
    { class: `anim row s-${r.subject} ${state}`, "data-row": r.key, "data-k": `row-${r.key}`, style: { "--fill": String(r.progress) } },
    el(
      "h2",
      { class: "row-t" },
      el(
        "button",
        { type: "button", class: "row-h", "aria-expanded": String(isOpen), "data-f": `row-${r.key}`, onclick: onToggle },
        ring(),
        el(
          "span",
          { class: "row-name" },
          el("span", { class: "row-title", text: r.title }),
          el("span", { class: "row-sub" }, el("span", { class: "subj", text: SUBJECTS[r.subject] }), isCurrent ? el("span", { class: "now", text: "Now" }) : null),
        ),
        r.minutes ? el("span", { class: "row-mins", text: `${r.minutes} min` }) : null,
      ),
    ),
    body === null ? null : el("div", { class: "row-body", inert: !isOpen }, el("div", {}, el("div", { class: "row-in" }, body))),
  );
};

// The open row on a wide screen: its title, subject and minutes, then its body.
const reader = (r, body, dayDone) =>
  el(
    "article",
    { class: `reader${r ? ` s-${r.subject}` : ""}`, "data-k": "reader" },
    r
      ? [
          el("h2", { class: "reader-h", tabindex: "-1", text: r.title }),
          el("p", { class: "reader-sub" }, el("span", { class: "subj", text: SUBJECTS[r.subject] }), r.minutes ? ` ${r.minutes} min` : null),
          body,
        ]
      : el("p", { class: "small", text: dayDone ? "Day done. Open any row to look back at it." : "Open a row to read it here." }),
  );

// Where to bring the reader's eye when a row opens: the reader beside the list, or the row itself.
const openTarget = (root, key) => (wide.matches ? root.querySelector(".reader") : root.querySelector(`[data-row="${key}"]`));

// Where keyboard focus goes when the control it was on folds away: the heading of what opened, or the day's own.
const focusTarget = (root, key) =>
  !key ? root.querySelector(".day-h") : wide.matches ? root.querySelector(".reader-h") : root.querySelector(`[data-row="${key}"] .row-h`);

const dayBar = (flow, swept) =>
  el("div", { class: "daybar", role: "img", "aria-label": swept ? "Day done" : `${flow.minutesDone} of ${flow.totalMinutes} minutes done` }, barParts(flow, swept, "seg"));

// Shown while the heading is off screen: the mini bar, what is current and how long it has left.
let stickyShown = false;
let headingWatch = null;

const stickyBar = (m, flow, swept, onTap) => {
  const current = flow.rows.find((r) => r.key === flow.current);
  const left = current?.minutes ? current.minutes - Math.round(current.minutes * current.progress) : null;
  const id = runningId(runs);
  const running = id === null ? undefined : timed[id];
  return el(
    "div",
    { class: "sticky", "data-k": "sticky", hidden: !stickyShown },
    el(
      "button",
      { type: "button", class: "sticky-in", "aria-label": current ? `Back to ${current.title}` : `Back to Day ${m.day}`, onclick: onTap },
      el("span", { class: "daybar mini", "aria-hidden": "true" }, barParts(flow, swept, "mini")),
      el(
        "span",
        { class: "sticky-line" },
        el("span", { class: "sticky-name", text: current ? current.title : `Day ${m.day} done` }),
        left !== null ? el("span", { class: "row-mins", text: `${left} min left` }) : null,
        // The running timer, filled by paintTimers; named when it sits in another row.
        running && running.row !== flow.current ? el("span", { class: "sticky-timer-name", text: running.name }) : null,
        el("span", { class: "sticky-timer" }),
      ),
    ),
  );
};

const watchHeading = (root) => {
  headingWatch?.disconnect();
  const heading = root.querySelector(".day-h");
  if (!heading) return;
  headingWatch = new IntersectionObserver(([entry]) => {
    stickyShown = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    const bar = root.querySelector(".sticky");
    if (bar) bar.hidden = !stickyShown;
  });
  headingWatch.observe(heading);
};

// Every second: each row's time, the sticky bar's running timer, and the cues at the cap (alert colour and "up",
// the tab title, and once per run a vibration and a screen-reader line). Only a timer on this day's rows counts;
// one left running on another day's page waits there.
const pageTitle = document.title;
const capNote = el("p", { class: "sr-only", "aria-live": "polite" });
const paintTimers = () => {
  const t = now();
  const shown = (id) => (isOver(runs[id], t, timed[id]?.cap) ? `${clock(elapsed(runs[id], t))} up` : clock(elapsed(runs[id], t)));
  for (const span of document.querySelectorAll("[data-timer]")) {
    span.textContent = shown(span.dataset.timer);
    span.classList.toggle("is-over", isOver(runs[span.dataset.timer], t, timed[span.dataset.timer]?.cap));
  }
  const id = runningId(runs);
  const mine = id !== null && id in timed;
  const over = mine && isOver(runs[id], t, timed[id].cap);
  const slot = document.querySelector(".sticky-timer");
  if (slot) {
    slot.textContent = mine ? shown(id) : "";
    slot.classList.toggle("is-over", over);
  }
  document.title = over ? `${timed[id].cap}:00 up · Day ${day}` : pageTitle;
  if (over && !buzzed.has(id)) {
    buzzed.add(id);
    navigator.vibrate?.(200);
    capNote.textContent = `${timed[id].name}: ${timed[id].cap} minutes up`;
  }
};

// The day's subjects in their colours, with minutes: the key to the bar's colours.
const subjectList = (flow) =>
  el("ul", { class: "subjects" }, flow.subjects.map(({ subject, minutes }) => el("li", { class: `s-${subject}` }, SUBJECTS[subject], el("span", { text: ` ${minutes} min` }))));

const heading = (m, flow) => [
  el("p", { class: "day-date", text: fullDate(m.date) }),
  el(
    "div",
    { class: "day-head" },
    el("h1", { class: "day-h", tabindex: "-1", text: `Day ${m.day}` }),
    m.day > 0 ? el("a", { class: "icon-btn", href: `day.html?d=${m.day - 1}`, "aria-label": `Day ${m.day - 1}` }, icon("chevron-left")) : null,
    m.day < DAYS ? el("a", { class: "icon-btn", href: `day.html?d=${m.day + 1}`, "aria-label": `Day ${m.day + 1}` }, icon("chevron-right")) : null,
  ),
  flow.subjects.length ? subjectList(flow) : null,
];

const summary = (m, flow) => {
  const minutes = el("b", { text: `${flow.minutesDone} of ${flow.totalMinutes} minutes` });
  if (!flow.done) return el("p", { class: "day-meta" }, minutes, ` done. Next: ${sentence(plain(flow.next))}`);
  if (sweepPending) return el("p", { class: "day-meta" }, minutes, " done.");
  const next = m.day < DAYS ? m.day + 1 : null;
  return el(
    "p",
    { class: "day-meta is-done" },
    m.isToday && next !== null ? `Day ${m.day} done. Day ${next} opens tomorrow. ` : `Day ${m.day} done. `,
    next !== null ? el("a", { class: "nowrap", href: `day.html?d=${next}`, text: `Preview Day ${next}` }) : null,
  );
};

const notFound = (message) =>
  el(
    "div",
    { class: "box notice" },
    el("h1", { text: "No such day" }),
    el("p", { text: Number.isNaN(day) ? `That is not a day number. The plan runs from Day 0 to Day ${DAYS}.` : message }),
    el("a", { class: "button", href: "day.html", text: "Go to today" }),
  );

const build = (data, m, flow, mutate, redraw) => {
  const blocks = new Map(m.blocks.map((b) => [b.key, b]));
  const bodyOf = (r) =>
    r.kind === "revise" ? reviseBody(m, mutate)
    : r.kind === "block" ? blockBody(blocks.get(r.key), r, mutate, redraw)
    : r.kind === "selftest" ? m.selftest.map((q) => question(q, m.baseline, mutate))
    : r.kind === "close" ? closeBody(m, mutate)
    : null;
  const toggle = (key) => () => {
    clearTimeout(advance);
    open = open === key ? null : key;
    redraw();
  };
  const backToRow = () => {
    const key = open ?? flow.current;
    const target = key ? openTarget(document, key) : document.querySelector(".day-head");
    target.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  };
  const swept = flow.done && !sweepPending;
  const side = wide.matches;
  const openRow = flow.rows.find((r) => r.key === open);
  return el(
    "div",
    { class: "day-grid" },
    stickyBar(m, flow, swept, backToRow),
    el(
      "div",
      { class: "day-lead" },
      heading(m, flow),
      m.cardReadyBy ? el("div", { class: "box notice" }, el("p", {}, `Card ready by ${longDate(m.cardReadyBy)}. Until then each block shows its outline topic and DSA problems.`)) : null,
      dayBar(flow, swept),
      summary(m, flow),
      el("div", { class: "daylist" }, flow.rows.map((r) => row(r, r.key === flow.current, side ? null : bodyOf(r), toggle(r.key)))),
    ),
    side ? reader(openRow, openRow && bodyOf(openRow), flow.done) : null,
  );
};

// Bring `node` to the top, then run `then` (at once when it is already in view).
const scrollThen = (node, reduced, then) => {
  if (node.getBoundingClientRect().top >= 0) return then();
  node.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  if (reduced) return then();
  let ran = false;
  const once = () => {
    if (!ran) (ran = true), then();
  };
  addEventListener("scrollend", once, { once: true });
  advance = setTimeout(once, 900); // browsers without scrollend
};

// Run `fn` after `delay`, then later still while the reader is pressing or typing. `advance` holds the timer.
const whenIdle = (fn, delay) => {
  const run = () => (busy() ? (advance = setTimeout(run, 250)) : fn());
  advance = setTimeout(run, delay);
};

renderHeader("day.html");
document.body.append(capNote);
loadData()
  .then((data) => {
    const root = document.getElementById("app");
    const draw = guarded(() => {
      const m = dayModel(day, data.outline, data.cardsByDay, data.schedule, data.problemsById, getState(), today());
      if (!m.ok) return root.replaceChildren(notFound(m.message));
      timed = Object.fromEntries(
        m.blocks.flatMap((b) => [
          ...b.problems.map((p) => ["p:" + p.id, { cap: PROBLEM_CAP, name: p.title, row: b.key, done: p.solved }]),
          ...b.tasks.filter((t) => t.cap !== null).map((t) => [t.doneId, { cap: t.cap, name: plain(t.text), row: b.key, done: t.done }]),
        ]),
      );
      buzzed ??= new Set(Object.keys(timed).filter((id) => isOver(runs[id], now(), timed[id].cap)));
      // A row ticked on another device or tab ends its run here too.
      for (const id of Object.keys(timed)) if (timed[id].done && runs[id]) endRun(id);
      const flow = dayFlow(m);
      const next = afterChange(lastFlow, flow, open, local);
      local = false;
      if (!flow.done) sweepPending = false;
      else if (lastFlow && !lastFlow.done && next.delay > 0) sweepPending = true;
      lastFlow = flow;
      if (next.delay > 0) {
        // Let the finished row show as done for a beat, then fold it and open the next one.
        clearTimeout(advance);
        whenIdle(() => {
          const hadFocus = root.contains(document.activeElement);
          open = next.open;
          draw();
          if (hadFocus && !root.contains(document.activeElement)) focusTarget(root, open)?.focus({ preventScroll: true });
          // Scroll once the finished row has folded, or the target moves up under the scroll.
          const reduced = reducedMotion();
          advance = setTimeout(() => {
            if (open) openTarget(root, open)?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
            else if (sweepPending) scrollThen(root.querySelector(".day-head"), reduced, () => whenIdle(() => {
              sweepPending = false;
              // Start every segment from empty, so the redraw sweeps the whole bar left to right.
              for (const part of root.querySelectorAll(".daybar .part")) part.classList.add("is-reset");
              draw();
            }, 0));
          }, reduced ? 0 : FOLD_MS);
        }, next.delay);
      } else open = next.open;
      rerender(root, () => build(data, m, flow, mutate, draw));
      watchHeading(root);
      paintTimers();
    });
    const mutate = (mutator) => {
      clearTimeout(advance);
      commit(mutator);
      local = true;
      draw();
    };
    onExternalChange(draw);
    wide.addEventListener("change", draw);
    draw();
    setInterval(paintTimers, 1000);
    document.addEventListener("visibilitychange", paintTimers);
  })
  .catch(showError);
