/* ==========================================================================
   progress.js — powers lessons/index.html.

   Reads what quiz.js recorded and shows what has been read and how the quizzes
   went. Revision runs in the SDE2 plan, so no due dates are shown here.

   Markup contract — the index declares the lessons, this enhances them:

     <ol class="lesson-list">
       <li data-lesson-id="0001" data-quiz-ids="0001-q1,0001-q2">…</li>
     </ol>

   With storage unavailable or empty every lesson simply reads "unread",
   which is the correct first-run state anyway.
   ========================================================================== */

(function () {
  function chip(text, kind) {
    var s = document.createElement("span");
    s.className = "status-chip " + kind;
    s.textContent = text;
    return s;
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!window.SDS) return;

    var items = Array.prototype.slice.call(document.querySelectorAll(".lesson-list > li[data-lesson-id]"));
    if (!items.length) return;

    var unreadCount = 0;

    items.forEach(function (li) {
      var id = li.getAttribute("data-lesson-id");
      var quizAttr = li.getAttribute("data-quiz-ids") || "";
      var quizIds = quizAttr ? quizAttr.split(",").map(function (s) { return s.trim(); }) : [];

      var state = window.SDS.dueState(id, quizIds);
      var slot = li.querySelector(".status-slot");
      if (!slot) {
        slot = document.createElement("span");
        slot.className = "status-slot";
        li.appendChild(slot);
      }
      slot.textContent = "";

      if (state.status === "unread") {
        unreadCount++;
        slot.appendChild(chip("unread", "is-unread"));
      }

      if (state.asked > 0) {
        slot.appendChild(chip(state.right + "/" + state.asked + " clean", "is-score"));
      }
    });

    /* ---- headline counts ---- */
    var read = items.length - unreadCount;
    function set(sel, value) {
      var n = document.querySelector(sel);
      if (n) n.textContent = value;
    }
    set("[data-stat=read]", read);
    set("[data-stat=total]", items.length);

    var bar = document.querySelector("[data-stat=bar]");
    if (bar) {
      var pct = items.length ? (read / items.length) * 100 : 0;
      bar.style.width = pct + "%";
      /* The bar is decorative; the value lives on the parent, which carries
         role=progressbar. Without this a screen reader reads an empty box. */
      var track = bar.parentNode;
      if (track && track.setAttribute) {
        track.setAttribute("aria-valuenow", String(Math.round(pct)));
      }
    }

    /* ---- reset ---- */
    var reset = document.querySelector("[data-action=reset]");
    if (reset) {
      reset.addEventListener("click", function () {
        window.SDS.reset();
        window.location.reload();
      });
    }
  });
})();
