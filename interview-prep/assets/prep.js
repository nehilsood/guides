/* ==========================================================================
   prep.js — visit tracking and review spacing for the guide index.

   Deliberately thinner than system-design-school's progress.js: these guides
   carry no quizzes, so there is nothing to grade. The only signal available
   is "did you open it, and how long ago" — so that is the only signal used,
   and the ladder is driven by visit count alone.

   Storage is per-browser and best-effort. Private windows, cleared site data
   and locked-down browsers all return nothing, and some contexts throw on
   access. Every call is guarded and the page renders correctly with no
   stored value at all.
   ========================================================================== */

window.Prep = (function () {
  var PREFIX = "prep:v1:";
  var LADDER_DAYS = [1, 3, 7, 21, 60];
  var DAY_MS = 86400000;

  function readJSON(key, fallback) {
    try {
      var raw = window.localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function writeJSON(key, value) {
    try { window.localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  function getVisits() { return readJSON("visits", {}); }

  /* Written by the inlined evidence script in each guide, which is the only
     other thing that touches this prefix. Shape: { "<guideId>": { field: text } }.
     A guide counts as started the moment one field has text in it; an emptied
     field deletes its key, and an emptied guide deletes its object, so
     "is there anything here" is just a key count. */
  function getEvidence() { return readJSON("evidence", {}); }

  function evidenceStarted(guideId) {
    var g = getEvidence()[guideId];
    return !!(g && Object.keys(g).length);
  }

  function recordVisit(guideId) {
    if (!guideId) return null;
    var all = getVisits();
    var now = Date.now();
    var prior = all[guideId];
    all[guideId] = {
      first: prior ? prior.first : now,
      last: now,
      visits: prior ? prior.visits + 1 : 1
    };
    writeJSON("visits", all);
    return all[guideId];
  }

  /* An expanding review schedule: 1, 3, 7, 21, 60 days from the last visit,
     one rung further out for each re-read. Re-reading is the only evidence
     of retention available here, so it is what moves the interval. */
  function dueState(guideId) {
    var v = getVisits()[guideId];
    if (!v) return { status: "unread", days: null, visits: 0 };

    var rung = Math.min(Math.max(0, v.visits - 1), LADDER_DAYS.length - 1);
    var interval = LADDER_DAYS[rung];
    var elapsed = (Date.now() - v.last) / DAY_MS;

    return {
      status: elapsed >= interval ? "due" : "resting",
      days: Math.max(0, Math.ceil(interval - elapsed)),
      visits: v.visits
    };
  }

  function reset() {
    try { window.localStorage.removeItem(PREFIX + "visits"); } catch (e) {}
  }

  return {
    getVisits: getVisits,
    recordVisit: recordVisit,
    dueState: dueState,
    getEvidence: getEvidence,
    evidenceStarted: evidenceStarted,
    reset: reset,
    LADDER_DAYS: LADDER_DAYS
  };
})();

/* --------------------------------------------------------------------------
   Index rendering. Each <li data-guide-id="0001"> gets its state stamped in,
   and the dashboard figures are filled from the same pass.
   -------------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", function () {
  var rows = Array.prototype.slice.call(document.querySelectorAll("[data-guide-id]"));
  if (!rows.length) return;

  var read = 0, due = [], evidence = 0;

  rows.forEach(function (row) {
    var id = row.getAttribute("data-guide-id");
    var state = window.Prep.dueState(id);

    if (window.Prep.evidenceStarted(id)) {
      evidence++;
      row.classList.add("has-evidence");
    }
    var badge = row.querySelector(".g-state");
    var title = row.querySelector(".g-title a");

    if (state.status === "unread") {
      if (badge) badge.textContent = "unread";
      return;
    }

    read++;

    if (state.status === "due") {
      if (badge) { badge.textContent = "due for review"; badge.className = "g-state is-due"; }
      due.push(title ? title.textContent : id);
    } else {
      if (badge) {
        badge.textContent = state.days === 1 ? "review in 1 day" : "review in " + state.days + " days";
        badge.className = "g-state is-read";
      }
    }
  });

  function setStat(name, value) {
    var el = document.querySelector('[data-stat="' + name + '"]');
    if (el) el.textContent = value;
  }

  setStat("read", read);
  setStat("due", due.length);
  setStat("evidence", evidence);

  var bar = document.querySelector('[data-stat="bar"]');
  if (bar) bar.style.width = Math.round((read / rows.length) * 100) + "%";
  var progressbar = document.querySelector('[role="progressbar"]');
  if (progressbar) progressbar.setAttribute("aria-valuenow", Math.round((read / rows.length) * 100));

  var panel = document.querySelector("[data-due-panel]");
  if (panel && due.length) {
    var list = document.createElement("ol");
    list.className = "due-list";
    due.forEach(function (name) {
      var li = document.createElement("li");
      li.textContent = name;
      list.appendChild(li);
    });
    var empty = panel.querySelector(".due-empty");
    if (empty) { empty.replaceWith(list); } else { panel.appendChild(list); }
  }
});
