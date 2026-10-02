/* ==========================================================================
   visit.js — loaded by each guide. Records that the guide was opened, so the
   index can show what has been read and what is due for review. Nothing else.
   The guide's own markup and styling are untouched by this file.
   ========================================================================== */

(function () {
  var PREFIX = "prep:v1:";

  function guideId() {
    var m = /(\d{4})-/.exec(window.location.pathname.split("/").pop() || "");
    return m ? m[1] : null;
  }

  var id = guideId();
  if (!id) return;

  try {
    var raw = window.localStorage.getItem(PREFIX + "visits");
    var all = raw ? JSON.parse(raw) : {};
    var now = Date.now();
    var prior = all[id];
    all[id] = {
      first: prior ? prior.first : now,
      last: now,
      visits: prior ? prior.visits + 1 : 1
    };
    window.localStorage.setItem(PREFIX + "visits", JSON.stringify(all));
  } catch (e) { /* storage blocked or full; the guide still reads fine */ }
})();
