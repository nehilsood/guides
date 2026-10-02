/* ==========================================================================
   store.js — the only place localStorage keys are named.
   quiz.js and evidence.js write; progress.js reads. Nothing else touches
   localStorage directly.

   Storage is per-browser and best-effort: private windows and cleared site
   data both return empty, and some contexts throw on access. Every call is
   guarded, and every consumer must render correctly with no stored value.
   ========================================================================== */

window.SDS = (function () {
  var PREFIX = "sds:v1:";

  function safeGet(key) {
    try { return window.localStorage.getItem(PREFIX + key); } catch (e) { return null; }
  }

  function safeSet(key, value) {
    try { window.localStorage.setItem(PREFIX + key, value); return true; } catch (e) { return false; }
  }

  function safeRemove(key) {
    try { window.localStorage.removeItem(PREFIX + key); return true; } catch (e) { return false; }
  }

  function readJSON(key, fallback) {
    var raw = safeGet(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function writeJSON(key, value) {
    try { return safeSet(key, JSON.stringify(value)); } catch (e) { return false; }
  }

  /* ---- quiz answers ------------------------------------------------------
     Shape: { "<quizId>": { correct: bool, attempts: int, at: epochMs } }   */

  function getAnswers() { return readJSON("answers", {}); }

  function recordAnswer(quizId, wasCorrect) {
    var all = getAnswers();
    var prior = all[quizId] || { attempts: 0 };
    all[quizId] = {
      correct: !!wasCorrect,
      attempts: prior.attempts + 1,
      at: Date.now()
    };
    writeJSON("answers", all);
    return all[quizId];
  }

  /* ---- lesson visits ----------------------------------------------------
     Shape: { "<lessonId>": { first: epochMs, last: epochMs, visits: int } } */

  function getVisits() { return readJSON("visits", {}); }

  function recordVisit(lessonId) {
    if (!lessonId) return null;
    var all = getVisits();
    var now = Date.now();
    var prior = all[lessonId];
    all[lessonId] = {
      first: prior ? prior.first : now,
      last: now,
      visits: prior ? prior.visits + 1 : 1
    };
    writeJSON("visits", all);
    return all[lessonId];
  }

  /* ---- spacing ----------------------------------------------------------
     Desirable difficulty, cheaply: a lesson becomes due again on an
     expanding schedule counted from the last visit. Getting its quizzes
     right pushes it further out; getting them wrong pulls it back in.      */

  var LADDER_DAYS = [1, 3, 7, 21, 60];
  var DAY_MS = 86400000;

  function dueState(lessonId, quizIds) {
    var visits = getVisits()[lessonId];
    if (!visits) return { status: "unread", days: null };

    var answers = getAnswers();
    var asked = 0, right = 0;
    (quizIds || []).forEach(function (id) {
      var a = answers[id];
      if (a) { asked++; if (a.correct && a.attempts === 1) right++; }
    });

    /* Rung on the ladder: how far out to push the next review. Clean
       first-attempt answers earn a longer interval; misses stay short. */
    var rung = 0;
    if (asked > 0) {
      var ratio = right / asked;
      rung = ratio >= 0.999 ? 3 : ratio >= 0.6 ? 2 : ratio > 0 ? 1 : 0;
    }
    rung = Math.min(rung + Math.max(0, visits.visits - 1), LADDER_DAYS.length - 1);

    var elapsed = (Date.now() - visits.last) / DAY_MS;
    var interval = LADDER_DAYS[rung];

    return {
      status: elapsed >= interval ? "due" : "resting",
      days: Math.max(0, Math.ceil(interval - elapsed)),
      elapsedDays: Math.floor(elapsed),
      asked: asked,
      right: right,
      visits: visits.visits
    };
  }

  /* ---- evidence -----------------------------------------------------------
     What the learner actually measured, keyed by lesson and field:
       { "<lessonId>": { "<fieldName>": "<their text>" } }

     Deliberately stored whole rather than per-field, so a lesson's evidence
     is one object to read, one object to export, and one object to clear.  */

  function getEvidence() { return readJSON("evidence", {}); }

  function getLessonEvidence(lessonId) {
    return getEvidence()[lessonId] || {};
  }

  function recordEvidence(lessonId, field, value) {
    if (!lessonId || !field) return false;
    var all = getEvidence();
    var lesson = all[lessonId] || {};
    /* An emptied field is a deletion, not an empty string: it should read as
       "not measured yet" everywhere downstream, including the résumé bullet
       that refuses to render without it. */
    if (value === null || value === "") {
      delete lesson[field];
    } else {
      lesson[field] = value;
    }
    if (Object.keys(lesson).length === 0) {
      delete all[lessonId];
    } else {
      all[lessonId] = lesson;
    }
    return writeJSON("evidence", all);
  }

  function reset() {
    safeRemove("answers");
    safeRemove("visits");
    safeRemove("evidence");
  }

  return {
    getAnswers: getAnswers,
    recordAnswer: recordAnswer,
    getVisits: getVisits,
    recordVisit: recordVisit,
    dueState: dueState,
    getEvidence: getEvidence,
    getLessonEvidence: getLessonEvidence,
    recordEvidence: recordEvidence,
    reset: reset,
    LADDER_DAYS: LADDER_DAYS
  };
})();
