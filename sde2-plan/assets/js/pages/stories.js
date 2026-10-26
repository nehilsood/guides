import { el, getState, commit, renderHeader, rerender, onExternalChange, debounced, flushPending, guarded, now } from "./common.js";
import { setStory } from "../store.js";

const LEADERSHIP_PRINCIPLES = [
  "Customer Obsession",
  "Ownership",
  "Invent and Simplify",
  "Are Right, A Lot",
  "Learn and Be Curious",
  "Hire and Develop the Best",
  "Insist on the Highest Standards",
  "Think Big",
  "Bias for Action",
  "Frugality",
  "Earn Trust",
  "Dive Deep",
  "Have Backbone; Disagree and Commit",
  "Deliver Results",
  "Strive to be Earth's Best Employer",
  "Success and Scale Bring Broad Responsibility",
];

const BLANK = { title: "", lps: [], s: "", t: "", a: "", r: "" };

const PARTS = [
  ["s", "Situation"],
  ["t", "Task"],
  ["a", "Action"],
  ["r", "Result"],
];

let filter = "";
let openId = null;

const liveStories = () =>
  Object.entries(getState().stories)
    .filter(([, story]) => !story.deleted)
    .sort(([a], [b]) => Number(a.slice(2)) - Number(b.slice(2)) || (a < b ? -1 : a > b ? 1 : 0));

const tagged = (story, lp) => Array.isArray(story.lps) && story.lps.includes(lp);

const storyCard = (id, story, draw) => {
  const save = (patch) => commit((s) => setStory(s, id, patch, now()));
  // One debounce for the whole card: edits to different fields collect into one patch.
  let pending = {};
  const flushPatch = debounced(() => {
    const patch = pending;
    pending = {};
    save(patch);
  }, 600);
  const saveLater = (patch) => {
    pending = { ...pending, ...patch };
    flushPatch();
  };
  const toggle = (lp, on) => {
    const set = new Set(getState().stories[id]?.lps ?? []);
    if (on) set.add(lp);
    else set.delete(lp);
    save({ lps: LEADERSHIP_PRINCIPLES.filter((p) => set.has(p)) });
    openId = id;
    draw();
  };
  return el(
    "details",
    { class: "box", "data-k": id, open: id === openId },
    el("summary", { text: story.title || "Untitled story" }),
    el("label", { class: "field", for: `${id}-title`, text: "Title" }),
    el("input", { id: `${id}-title`, class: "text-input", type: "text", value: story.title ?? "", oninput: (e) => saveLater({ title: e.target.value }), onblur: flushPending }),
    el("p", { class: "field", text: "Leadership principles" }),
    el("div", { class: "lp-list" }, LEADERSHIP_PRINCIPLES.map((lp) => el("label", {}, el("input", { type: "checkbox", checked: tagged(story, lp), onchange: (e) => toggle(lp, e.target.checked) }), lp))),
    PARTS.map(([key, label]) => [
      el("label", { class: "field", for: `${id}-${key}`, text: label }),
      el("textarea", { id: `${id}-${key}`, rows: "4", oninput: (e) => saveLater({ [key]: e.target.value }), text: story[key] ?? "" }),
    ]),
    el("p", {}, el("button", { type: "button", class: "btn danger", onclick: () => { flushPending(); save({ ...BLANK, deleted: true }); draw(); }, text: "Delete story" })),
  );
};

const build = (draw) => {
  const stories = liveStories();
  const shown = filter ? stories.filter(([, story]) => tagged(story, filter)) : stories;
  const add = () => {
    const id = `s-${Date.now()}`;
    commit((s) => setStory(s, id, BLANK, now()));
    openId = id;
    draw();
  };
  return el(
    "div",
    {},
    el("h1", { text: "Story bank" }),
    el("p", { class: "box notice", text: "Private: saved only on this device and in your private progress repo." }),
    el(
      "section",
      { class: "box" },
      el("h2", { text: "Leadership principles" }),
      LEADERSHIP_PRINCIPLES.map((lp) => el("div", { class: "lp-count" }, el("span", { text: lp }), el("span", { class: "small", text: `${stories.filter(([, story]) => tagged(story, lp)).length}` }))),
    ),
    el("div", { class: "story-h" }, el("h2", { text: `Stories (${shown.length})` }), el("button", { type: "button", class: "button", onclick: add, text: "Add story" })),
    el(
      "div",
      {},
      el("label", { class: "field", for: "lp-filter", text: "Show stories for" }),
      el("select", { id: "lp-filter", class: "text-input", onchange: (e) => { filter = e.target.value; draw(); } }, el("option", { value: "", text: "All principles" }), LEADERSHIP_PRINCIPLES.map((lp) => el("option", { value: lp, selected: lp === filter, text: lp }))),
    ),
    shown.length ? shown.map(([id, story]) => storyCard(id, story, draw)) : el("p", { class: "small", text: "No stories yet. Add one and tag it with the principles it shows." }),
  );
};

renderHeader("stories.html");
const root = document.getElementById("app");
const draw = guarded(() => {
  rerender(root, () => build(draw));
  const fresh = root.querySelector(`details[data-k="${openId}"]`);
  if (fresh) fresh.open = true;
  openId = null;
});
onExternalChange(draw);
draw();
