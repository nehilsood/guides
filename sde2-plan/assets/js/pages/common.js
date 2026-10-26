import { load, save, merge, KEY } from "../store.js";
import { todayIST, dayNumber, DAYS } from "../dates.js";
import { startSync, scheduleSync, onStatus, getStatus, describe } from "./syncwire.js";

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

// Re-render a page without collapsing the <details> the reader has opened.
export const rerender = (root, build) => {
  flushPending();
  const open = new Set([...root.querySelectorAll("details[open][data-k]")].map((d) => d.dataset.k));
  root.replaceChildren(build());
  for (const d of root.querySelectorAll("details[data-k]")) d.open = open.has(d.dataset.k);
};

// Only link out to https pages (or, with `pattern`, to a relative path); anything else shows as plain text.
export const safeHref = (url, pattern = /^https:\/\//) => (typeof url === "string" && pattern.test(url) ? url : null);

export const longDate = (dateStr) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(dateStr + "T00:00:00Z"),
  );

export { formatViews, formatHours, codeParts } from "../format.js";

const TRACKS = { dsa: "DSA", hld: "HLD", lld: "LLD", ai: "AI", cs: "CS basics", hard: "DSA hard" };
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
  const index = await getJson("data/days/index.json").catch(() => null);
  const files = Array.isArray(index) ? index : [];
  const months = await Promise.all(files.map(loadCardFile));
  const cardsByDay = {};
  for (const card of months.flat()) cardsByDay[card.day] = card;
  return { outline, schedule, problems, problemsById: Object.fromEntries(problems.map((p) => [p.id, p])), cardsByDay };
};

const NAV = [
  ["Home", "index.html"],
  ["Today", "day.html"],
  ["Revise", "revise.html"],
  ["Outline", "outline.html"],
  ["Stories", "stories.html"],
  ["Settings", "settings.html"],
];

export const renderHeader = (active) => {
  const nav = el(
    "nav",
    { class: "nav", "aria-label": "Main" },
    NAV.map(([label, href]) => el("a", { href, "aria-current": href === active ? "page" : null, text: label })),
  );
  document.getElementById("site-header").append(el("div", { class: "brand", text: "SDE2 plan" }), syncDot(), nav);
};

const syncDot = () => {
  const label = el("span", { class: "sr-only" });
  const link = el("a", { class: "sync-dot", href: "settings.html" }, el("span", { class: "dot", "aria-hidden": "true" }), label);
  const paint = (st) => {
    const text = describe(st);
    link.dataset.kind = st.kind;
    link.title = text;
    label.textContent = text;
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

export const ratingButtons = (id, name, onRate) =>
  el(
    "span",
    { class: "btns rate" },
    [["easy", "😀 Easy"], ["ok", "😐 OK"], ["struggled", "😣 Struggled"]].map(([rating, label]) =>
      el("button", { type: "button", class: "btn", "aria-label": `${label.replace(/^\S+ /, "")}: ${name}`, onclick: () => onRate(id, rating), text: label }),
    ),
  );

export const reviseTag = (id, step) => (id.startsWith("p:") ? `re-solve #${step + 1}` : "re-read");
