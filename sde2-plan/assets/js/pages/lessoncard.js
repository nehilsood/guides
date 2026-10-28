import { guideOf, pickQuestions, visitMarks, visitProgress, RATING_WORD, visitLine, rateHint, backNote, barText } from "../lessons.js";
import { markLesson, rateLesson, rerateLesson } from "../store.js";
import { el, getState, today, now, safeHref, fragment, chip, say, MARK_WORD } from "./common.js";
import { icon } from "./icons.js";

// A lesson visit's card: the body of a lesson row on the day page. Question files load on demand into page memory:
// per lesson, the file, "loading" or "failed". Which answers are on screen and which ratings are being changed are
// page memory too; marks and ratings are saved, so a reload resumes at the first unmarked question. `focusNext` is
// where focus goes after the next draw, and the step it names fades in.
const questionFiles = new Map();
const answersShown = new Set();
const changing = new Set();
let focusNext = null;

const loadQuestions = (lesson, redraw) => {
  questionFiles.set(lesson, "loading");
  fetch(`data/questions/${lesson}.json`)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`${res.status}`))))
    .then((file) => questionFiles.set(lesson, Array.isArray(file?.questions) ? file : "failed"))
    .catch(() => questionFiles.set(lesson, "failed"))
    .then(redraw);
  return "loading";
};

const fade = (key) => (focusNext === key ? " fade" : "");

// A missed part is hollow, so the bar doesn't rely on colour; its text counts the marks.
const bar3 = (picks, marks, step) =>
  el("div", { class: "bar3", role: "img", "aria-label": barText(picks, marks) }, picks.map((q, i) => el("i", { class: marks[q.id] ? `is-${marks[q.id]}` : i === step ? "is-now" : null })));

const kbd = (k) => el("kbd", { text: k });
const keysLine = () => el("p", { class: "keys" }, "Keys: ", kbd("S"), " shows the answer, ", kbd("G"), " or ", kbd("M"), " marks it, ", kbd("1"), " ", kbd("2"), " ", kbd("3"), " rate.");

// A quiz's options; once the answer shows, the correct one is marked, in words as well as colour.
const options = (q, open) =>
  q.options?.length
    ? el("ol", { class: "options" }, q.options.map((o, i) => (open && i === q.correct ? el("li", { class: "is-correct" }, fragment(o), el("span", { class: "tag good", text: "Correct" })) : el("li", {}, fragment(o)))))
    : null;

const answer = (q, lesson) =>
  el(
    "div",
    { class: `drill-a${fade(`a-${lesson}`)}`, tabindex: "-1", "data-f": `a-${lesson}` },
    el("p", { class: "drill-a-h", text: "Answer" }),
    fragment(q.a),
    q.flag
      ? el("div", { class: "flag" }, el("p", { class: "drill-a-h", text: "Red flag" }), el("div", { class: "flag-text" }, fragment(q.flag)), el("p", { class: "small", text: "Careful: if you said the red flag, mark it Missed." }))
      : null,
  );

const cardQuestion = (v, picks, marks, step, act) => {
  const q = picks[step];
  const open = answersShown.has(`${v.lesson}/${q.id}`);
  return el(
    "div",
    { class: `flash${fade(`q-${v.lesson}`)}` },
    el("div", { class: "flash-top" }, el("span", { class: "drill-count", text: `Question ${step + 1} of ${picks.length}` }), q.missedLast ? el("span", { class: "tag warn", text: "Missed last time" }) : null),
    bar3(picks, marks, step),
    el("div", { class: "drill-q", tabindex: "-1", "data-f": `q-${v.lesson}` }, fragment(q.q)),
    options(q, open),
    open
      ? [
          answer(q, v.lesson),
          el(
            "div",
            { class: "marks", role: "group", "aria-label": "Did you get it from memory?" },
            el("button", { type: "button", class: "btn got", "data-key": "g", onclick: () => act.mark(q, "got") }, icon("check"), MARK_WORD.got),
            el("button", { type: "button", class: "btn missed", "data-key": "m", onclick: () => act.mark(q, "missed") }, icon("x"), MARK_WORD.missed),
          ),
        ]
      : [
          el("p", { class: "drill-hint", text: q.kind === "headline" ? "Out loud, against “The whole answer”" : "Answer from memory first, out loud or on paper." }),
          el("button", { type: "button", class: "button", "data-key": "s", onclick: () => act.show(q), text: "Show the answer" }),
        ],
  );
};

// "Reread: <section>" to the teaching section that answers it, else the lesson; with no link at all, nothing.
const reread = (q, url) => {
  const [href, text] = safeHref(q.teach?.url) ? [q.teach.url, `Reread: ${q.teach.title}`] : [safeHref(url), "Reread the lesson"];
  return href ? el("a", { class: "jump", href, target: "_blank", rel: "noopener" }, icon("stories"), text, icon("external")) : null;
};

const missedList = (v, missed) =>
  el(
    "ul",
    { class: "missed-list" },
    missed.map((q) =>
      el(
        "li",
        {},
        el("div", { class: "q-line" }, el("span", { class: "tag warn", text: "Missed" }), fragment(q.q)),
        reread(q, v.url),
        el("details", { "data-k": `again-${v.lesson}-${q.id}` }, el("summary", { text: "See the answer again" }), el("div", { class: "again" }, fragment(q.a))),
      ),
    ),
  );

const ratings = (v, got, rating, act) => [
  el("p", { class: "rate-h", id: `rate-h-${v.lesson}`, text: "How did it go?" }),
  el(
    "div",
    { class: "seg", role: "group", "aria-labelledby": `rate-h-${v.lesson}` },
    Object.entries(RATING_WORD).map(([r, word], i) =>
      el("button", { type: "button", "aria-pressed": String(r === rating), "data-f": `rate-${v.lesson}-${r}`, "data-key": String(i + 1), onclick: () => act.rate(r), text: word }),
    ),
  ),
  el("p", { class: "rate-hint", text: rateHint(got) }),
];

const endScreen = (v, picks, marks, got, rating, act) => {
  const missed = picks.filter((q) => marks[q.id] === "missed");
  return el(
    "div",
    { class: `flash${fade(`score-${v.lesson}`)}` },
    el("div", { class: "flash-top" }, el("span", { class: "drill-count", text: "Done" })),
    bar3(picks, marks, picks.length),
    el("p", { class: "score", tabindex: "-1", "data-f": `score-${v.lesson}` }, el("b", { text: `${got} of ${picks.length}` }), " from memory"),
    missed.length ? [el("p", { class: "next-step", text: "Reread what you missed, then rate it." }), missedList(v, missed)] : el("p", { class: "next-step", text: "All from memory. Rate it." }),
    rating && !changing.has(v.lesson)
      ? el(
          "div",
          { class: `rated${fade(`rated-${v.lesson}`)}`, tabindex: "-1", "data-f": `rated-${v.lesson}` },
          icon("check"),
          el("p", {}, el("b", { text: `Rated ${RATING_WORD[rating]}.` }), ` ${backNote(v.item, today())} `, el("button", { type: "button", class: "link-btn", onclick: act.change, text: "Change" })),
        )
      : ratings(v, got, rating, act),
  );
};

// The links under the card: the whole lesson (when the index has it) and, on IP, its plain-words sections.
const lessonLinks = (v, plainLinks) =>
  el(
    "p",
    { class: "lesson-links" },
    chip(v.url, "Open the whole lesson", "stories"),
    plainLinks.map((p) => chip(p.url, plainLinks.length > 1 ? `Explain it plainly: ${p.title}` : "Explain it plainly", "article")),
  );

const drill = (v, picks, mutate, redraw) => {
  const { lesson } = v;
  const marks = visitMarks(v.item, today());
  const { step, got, done } = visitProgress(picks, marks);
  const rating = v.rated ? v.item.visits.at(-1).rating : null;
  const open = !done && answersShown.has(`${lesson}/${picks[step].id}`);
  const act = {
    show: (q) => {
      answersShown.add(`${lesson}/${q.id}`);
      focusNext = `a-${lesson}`;
      say(`Question ${step + 1}: answer shown. Did you get it from memory?`);
      redraw();
    },
    mark: (q, result) => {
      const after = visitProgress(picks, { ...marks, [q.id]: result });
      focusNext = after.done ? `score-${lesson}` : `q-${lesson}`;
      say(after.done ? `Done. ${after.got} of ${picks.length} from memory.` : `Marked ${MARK_WORD[result]}. Question ${after.step + 1} of ${picks.length}.`);
      mutate((s) => markLesson(s, lesson, q.id, result, now()));
    },
    undo: () => {
      const q = picks[step - 1];
      answersShown.add(`${lesson}/${q.id}`);
      focusNext = `a-${lesson}`;
      say(`Back to question ${step}.`);
      mutate((s) => markLesson(s, lesson, q.id, null, now()));
    },
    rate: (r) => {
      changing.delete(lesson);
      focusNext = `rated-${lesson}`;
      mutate((s) => (rating ? rerateLesson : rateLesson)(s, lesson, r, today(), now()));
      say(`Rated ${RATING_WORD[r]}. ${backNote(getState().items[`l:${lesson}`], today())}`);
    },
    change: () => {
      changing.add(lesson);
      focusNext = `rate-${lesson}-${rating}`;
      redraw();
    },
  };
  return [
    done ? endScreen(v, picks, marks, got, rating, act) : cardQuestion(v, picks, marks, step, act),
    el(
      "div",
      { class: "below" },
      step > 0 && !open && !rating ? el("button", { type: "button", class: "link-btn", onclick: act.undo, text: `Change my mark on question ${step}` }) : null,
      rating ? null : keysLine(),
    ),
  ];
};

// A file that gives the visit no questions can't be run or rated, so it shows as a failed load.
export const lessonBody = (v, mutate, redraw) => {
  const file = questionFiles.get(v.lesson) ?? loadQuestions(v.lesson, redraw);
  const loaded = typeof file === "object";
  const picks = loaded ? pickQuestions(file, v.item, today()) : [];
  const retry = () => (loadQuestions(v.lesson, redraw), redraw());
  return [
    el("p", { class: "lesson-meta" }, el("span", { class: "lesson-src" }, icon("stories"), guideOf(v.lesson)), el("span", { text: visitLine(v) })),
    file === "loading" ? el("p", { class: "small", text: "Loading the questions…" })
    : picks.length ? drill(v, picks, mutate, redraw)
    : el("div", { class: "load-failed" }, el("p", { text: "Couldn't load the questions." }), el("button", { type: "button", class: "btn", onclick: retry, text: "Try again" })),
    lessonLinks(v, loaded ? file.plain ?? [] : []),
  ];
};

// After a draw: focus goes where the card's last step sent it.
export const takeFocus = (root) => {
  if (focusNext) root.querySelector(`[data-f="${focusNext}"]`)?.focus();
  focusNext = null;
};

// Laptop keys while a lesson card is open in the reader (the day page calls this only on a wide screen): S shows
// the answer, G or M marks it, 1 2 3 rate. Each presses the card's button for that key, so a key does nothing when
// its button isn't on screen.
const CARD_KEYS = new Set(["s", "g", "m", "1", "2", "3"]);
export const cardKey = (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  const key = e.key.toLowerCase();
  const button = CARD_KEYS.has(key) && document.querySelector(`.reader [data-key="${key}"]`);
  if (button) {
    e.preventDefault();
    button.click();
  }
};
