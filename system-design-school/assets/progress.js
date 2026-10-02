/* ==========================================================================
   progress.js — powers lessons/index.html.

   Reads what quiz.js recorded and answers two questions the learner actually
   has: what have I not read, and what is due for review. Spacing is handled
   by SDS.dueState; this file only renders it.

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

    var counts = { unread: 0, due: 0, resting: 0 };
    var dueList = [];

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
        counts.unread++;
        slot.appendChild(chip("unread", "is-unread"));
      } else if (state.status === "due") {
        counts.due++;
        slot.appendChild(chip("due for review", "is-due"));
        li.classList.add("is-due");
        var title = li.querySelector(".l-title");
        dueList.push({
          id: id,
          title: title ? title.textContent.trim() : id,
          href: (li.querySelector("a") || {}).getAttribute ? li.querySelector("a").getAttribute("href") : null,
          elapsed: state.elapsedDays
        });
      } else {
        counts.resting++;
        slot.appendChild(chip("review in " + state.days + (state.days === 1 ? " day" : " days"), "is-resting"));
      }

      if (state.asked > 0) {
        slot.appendChild(chip(state.right + "/" + state.asked + " clean", "is-score"));
      }
    });

    /* ---- headline counts ---- */
    var read = items.length - counts.unread;
    function set(sel, value) {
      var n = document.querySelector(sel);
      if (n) n.textContent = value;
    }
    set("[data-stat=read]", read);
    set("[data-stat=total]", items.length);
    set("[data-stat=due]", counts.due);

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

    /* ---- due-for-review panel ---- */
    var panel = document.querySelector("[data-due-panel]");
    if (panel) {
      panel.textContent = "";
      if (!dueList.length) {
        var p = document.createElement("p");
        p.className = "due-empty";
        p.textContent = read === 0
          ? "Nothing due — nothing read yet. Start with lesson 0001."
          : "Nothing due for review. Spacing is doing its job; go forward instead.";
        panel.appendChild(p);
      } else {
        var ul = document.createElement("ul");
        ul.className = "due-items";
        dueList.forEach(function (d) {
          var li = document.createElement("li");
          var a = document.createElement("a");
          a.href = d.href || "#";
          a.textContent = d.title;
          li.appendChild(a);
          var meta = document.createElement("span");
          meta.className = "due-meta";
          meta.textContent = "last opened " + (d.elapsed === 0 ? "today" : d.elapsed + (d.elapsed === 1 ? " day ago" : " days ago"));
          li.appendChild(meta);
          ul.appendChild(li);
        });
        panel.appendChild(ul);
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
