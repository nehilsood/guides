import { load, save, merge, KEY } from "../store.js";
import { todayIST, dayNumber, DAYS } from "../dates.js";
import { startSync, scheduleSync, onStatus, getStatus, describe } from "./syncwire.js";
import { icon } from "./icons.js";
import { plain, longDate } from "../format.js";
import { RATING_WORD } from "../lessons.js";

export const today = () => todayIST(new Date());
export const now = () => Date.now();

let state = null;
export const getState = () => (state ??= load(localStorage));

export const commit = (mutator) => {
  state = mutator(getState());
  save(localStorage, state);
  scheduleSync();
  return state;
};

// Each page registers one callback that redraws it after a sync or another tab changed the state.
let rerenderPage = () => {};
export const onExternalChange = (fn) => {
  rerenderPage = fn;
};

export const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "text") node.textContent = value;
    // The CSP forbids style attributes; custom properties go through the CSSOM instead.
    else if (key === "style") for (const [prop, v] of Object.entries(value)) node.style.setProperty(prop, v);
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
};

const pendingFlushes = new Set();

// Debounced saver. Pending saves are written at once by flushPending(): before a re-render, on blur,
// and when the page is hidden or closed, so nothing typed is lost.
export const debounced = (fn, ms) => {
  let timer = null;
  let args = null;
  const flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    pendingFlushes.delete(flush);
    fn(...args);
  };
  return (...a) => {
    args = a;
    clearTimeout(timer);
    pendingFlushes.add(flush);
    timer = setTimeout(flush, ms);
  };
};

export const flushPending = () => {
  for (const flush of [...pendingFlushes]) flush();
};

window.addEventListener("pagehide", flushPending);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushPending();
});

// A redraw from a sync or another tab must not replace a field the reader is typing in. It waits until
// focus leaves the field, and never runs between a press and its click (a button tap would be lost).
const NON_TEXT = new Set(["checkbox", "radio", "button", "submit", "file", "range"]);
const typing = () => {
  const a = document.activeElement;
  const inApp = a && document.getElementById("app")?.contains(a);
  return Boolean(inApp && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !NON_TEXT.has(a.type))));
};
// True while the reader is pressing or typing: a redraw now would swallow the tap or the keystrokes.
export const busy = () => typing() || pointerDown;
let redrawPending = false;
let pointerDown = false;
const settle = (delay) =>
  setTimeout(() => {
    if (redrawPending && !typing() && !pointerDown) {
      redrawPending = false;
      rerenderPage();
    }
  }, delay);
const requestRedraw = () => {
  redrawPending = true;
  if (!typing() && !pointerDown) settle(0);
};
document.addEventListener("pointerdown", () => (pointerDown = true), true);
const pointerEnd = () => {
  pointerDown = false;
  settle(300); // fallback: the click normally redraws sooner
};
document.addEventListener("pointerup", pointerEnd, true);
document.addEventListener("pointercancel", pointerEnd, true);
document.addEventListener("click", () => settle(0), true);
document.addEventListener("focusout", () => settle(0));

startSync({
  getState,
  setState: (next) => {
    state = next;
    save(localStorage, state);
  },
  onChanged: requestRedraw,
});

// Another tab saved: merge its state into ours, so neither tab's edit is overwritten later.
window.addEventListener("storage", (event) => {
  if (event.key !== KEY) return;
  state = merge(getState(), load(localStorage));
  requestRedraw();
});

// Re-render a page without collapsing the <details> the reader has opened or losing keyboard focus (a control
// with `data-f` gets focus back). Elements with class `anim` and a `data-k` start from their old class and
// --fill, then switch to the new ones, so their transitions run.
const visual = (node) => ({ cls: node.className, fill: node.style.getPropertyValue("--fill") });
const paint = (node, { cls, fill }) => {
  node.className = cls;
  if (fill) node.style.setProperty("--fill", fill);
  else node.style.removeProperty("--fill");
};

export const rerender = (root, build) => {
  flushPending();
  const open = new Set([...root.querySelectorAll("details[open][data-k]")].map((d) => d.dataset.k));
  const before = new Map([...root.querySelectorAll(".anim[data-k]")].map((n) => [n.dataset.k, visual(n)]));
  const focused = root.contains(document.activeElement) ? document.activeElement.dataset.f : undefined;
  root.replaceChildren(build());
  for (const d of root.querySelectorAll("details[data-k]")) d.open = open.has(d.dataset.k);
  if (focused) root.querySelector(`[data-f="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  const moved = [...root.querySelectorAll(".anim[data-k]")].filter((n) => before.has(n.dataset.k)).map((n) => [n, visual(n)]);
  if (!moved.length) return;
  for (const [n] of moved) paint(n, before.get(n.dataset.k));
  void root.offsetHeight; // one reflow, so the browser sees the old state before the new one
  for (const [n, after] of moved) paint(n, after);
};

// Only link out to https pages (or, with `pattern`, to a relative path); anything else shows as plain text.
export const safeHref = (url, pattern = /^https:\/\//) => (typeof url === "string" && pattern.test(url) ? url : null);

export const chip = (url, text, name, focusKey) => {
  const href = safeHref(url);
  return href && el("a", { class: "chip", href, target: "_blank", rel: "noopener", "data-f": focusKey }, name && icon(name), text, icon("external"));
};

// A polite live region; a page that speaks through say() appends liveNote to its body.
export const liveNote = el("p", { class: "sr-only", "aria-live": "polite" });
export const say = (text) => (liveNote.textContent = text);

// The words for a mark, shared by the self-test and the lesson card.
export const MARK_WORD = { got: "Got it", partly: "Partly", missed: "Missed" };

// Question HTML copied from the guides, as nodes: only these tags are kept, with no attributes, and an https link
// opens in a new tab. Any other element is replaced by what it holds.
const KEEP = new Set(["A", "B", "CODE", "EM", "I", "STRONG", "SUB", "SUP", "P", "BR", "UL", "OL", "LI"]);
const clean = (node) => {
  if (node.nodeType === Node.TEXT_NODE) return [node];
  if (node.nodeType !== Node.ELEMENT_NODE || node.tagName === "SCRIPT" || node.tagName === "STYLE") return [];
  const inner = [...node.childNodes].flatMap(clean);
  if (node.tagName === "A") {
    const href = safeHref(node.getAttribute("href"));
    return href ? [el("a", { href, target: "_blank", rel: "noopener" }, inner)] : inner;
  }
  return KEEP.has(node.tagName) ? [el(node.tagName.toLowerCase(), {}, inner)] : inner;
};
export const fragment = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html;
  return [...t.content.childNodes].flatMap(clean);
};

export const fullDate = (dateStr) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(dateStr + "T00:00:00Z"));

export { formatViews, formatHours, codeParts, leadIn, plain, sentence, longDate } from "../format.js";

const TRACKS = { dsa: "DSA", hld: "HLD", lld: "LLD", ai: "AI", cs: "CS basics", hard: "DSA hard", catchup: "Catch-up" };
export const trackLabel = (track) => (typeof track === "string" ? TRACKS[track] ?? track.charAt(0).toUpperCase() + track.slice(1) : "");

export const todayDayClamped = () => Math.min(DAYS, Math.max(0, dayNumber(today())));

const getJson = async (url) => {
  const res = await fetch(url);
  return res.ok ? res.json() : null;
};

// One unreadable card file must not take the pages down: it contributes no cards.
const loadCardFile = async (name) => {
  try {
    const cards = await getJson(`data/days/${name}`);
    if (Array.isArray(cards)) return cards.filter((c) => Number.isInteger(c?.day) && Array.isArray(c.blocks));
  } catch {}
  console.warn("Skipping bad card file", name);
  return [];
};

export const loadData = async () => {
  const [outline, schedule, problems] = await Promise.all(
    ["outline", "dsa-schedule", "problems"].map((name) => getJson(`data/${name}.json`)),
  );
  if (!outline || !schedule || !problems) throw new Error("Could not load the plan data.");
  const lessons = await getJson("data/questions/index.json").catch(() => null);
  const lessonIndex = {};
  for (const { lesson, label, title, track, url } of Array.isArray(lessons) ? lessons : []) if (typeof lesson === "string") lessonIndex[lesson] = { label, title, track, url };
  const index = await getJson("data/days/index.json").catch(() => null);
  const files = Array.isArray(index) ? index : [];
  const months = await Promise.all(files.map(loadCardFile));
  const cardsByDay = {};
  for (const card of months.flat()) cardsByDay[card.day] = card;
  return { outline, schedule, problems, problemsById: Object.fromEntries(problems.map((p) => [p.id, p])), cardsByDay, lessonIndex };
};

const NAV = [
  ["Home", "index.html", "home"],
  ["Today", "day.html", "today"],
  ["Revise", "revise.html", "revise"],
  ["Outline", "outline.html", "outline"],
  ["Stories", "stories.html", "stories"],
];

// Five tabs (a bottom bar on phones, a rail on wide screens); Settings sits top right by the sync status.
export const renderHeader = (active) => {
  const here = (href) => (href === active ? "page" : null);
  const tabs = el(
    "nav",
    { class: "tabs", "aria-label": "Main" },
    NAV.map(([label, href, name]) => el("a", { href, "aria-current": here(href) }, icon(name), el("span", { text: label }))),
  );
  const settings = el("a", { class: "icon-btn", href: "settings.html", "aria-label": "Settings", "aria-current": here("settings.html") }, icon("settings"));
  document.getElementById("site-header").append(
    el("a", { class: "brand", href: "index.html" }, icon("mark"), el("span", { text: "SDE2 plan" })),
    el("div", { class: "top-right" }, syncStatus(), settings),
    tabs,
  );
};

const SYNC_WORDS = { off: "Off", syncing: "Saving", synced: "Synced", error: "Not synced" };

const syncStatus = () => {
  const word = el("span");
  const link = el("a", { class: "sync-dot", href: "settings.html" }, el("span", { class: "dot", "aria-hidden": "true" }), word);
  const paint = (st) => {
    link.dataset.kind = st.kind;
    link.title = describe(st);
    link.setAttribute("aria-label", `Sync: ${describe(st)}`);
    word.textContent = SYNC_WORDS[st.kind] ?? "";
  };
  onStatus(paint);
  paint(getStatus());
  return link;
};

export const showError = (err) => {
  document.getElementById("app").replaceChildren(
    el("div", { class: "box notice" }, el("p", { text: "Something went wrong loading this page." }), el("p", { class: "small", text: String(err.message ?? err) })),
  );
};

// Wrap a re-render so an error after a click shows the same message as a failed load.
export const guarded = (draw) => () => {
  try {
    draw();
  } catch (err) {
    showError(err);
  }
};

const SWEEP_STEP = 40;
const SWEEP_MAX = 300;

// The day bar: one segment per row of a day's flow (dayflow.js). The day page's sticky bar and Home's Today card
// use the mini copy, which has no data-seg (rigs count the main bar's segments).
export const barParts = (flow, swept, prefix) =>
  flow.rows.map((r, i) => {
    const state = swept || r.done ? "is-done" : r.key === flow.current ? "is-current" : "is-later";
    const style = {
      "--fill": String(r.progress),
      ...(swept ? { "--delay": `${Math.min(i * SWEEP_STEP, SWEEP_MAX)}ms` } : {}),
      ...(r.kind === "block" ? { "flex-grow": String(r.minutes) } : {}),
    };
    return el("i", { "data-seg": prefix === "seg" ? "" : null, "data-k": `${prefix}-${r.key}`, class: `anim part s-${r.subject} ${state}${r.kind === "block" ? " is-block" : ""}`, style });
  });

const ratingButtons = (id, name, onRate) =>
  el(
    "span",
    { class: "seg", role: "group", "aria-label": `How well did you remember ${name}?` },
    Object.entries(RATING_WORD).map(([rating, label]) =>
      el("button", { type: "button", "aria-label": `${label}: ${name}`, "data-f": `${id}-${rating}`, onclick: () => onRate(id, rating), text: label }),
    ),
  );

const reviseTag = (id, step) => (id.startsWith("p:") ? `re-solve #${step + 1}` : "re-read");

// One row in revision: its name, a tag, overdue or the date it comes back, then `action` (a due row's way to do it, or null).
export const dueRow = (r, text, tag, action) =>
  el(
    "div",
    { class: "due" },
    el("p", { class: "due-text", text }),
    el(
      "p",
      { class: "due-meta" },
      el("span", { class: "tag", text: tag }),
      r.overdue ? el("span", { class: "tag warn", text: `overdue since ${longDate(r.due)}` }) : null,
      r.isDue ? null : el("span", { class: "tag", text: longDate(r.due) }),
    ),
    action,
  );

// One thing in revision, on Revise and on the day page's Revise row: due ones take a rating, later ones show the
// date they come back.
export const reviseRow = (r, onRate) => dueRow(r, plain(r.label), reviseTag(r.id, r.step), r.isDue ? ratingButtons(r.id, plain(r.label), onRate) : null);
