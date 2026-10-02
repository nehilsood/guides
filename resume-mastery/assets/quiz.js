/* ==========================================================================
   quiz.js — retrieval-practice widget.

   Markup contract:

     <div class="quiz" data-quiz-id="0002-q1">
       <p class="q">Question text?</p>
       <ol class="options">
         <li data-correct="true">Option one text</li>
         <li>Option two text</li>
       </ol>
       <div class="why">Why the right answer is right.</div>
     </div>

   Feedback is immediate — the tight loop is the point. The explanation is
   revealed only after an attempt, so the learner has to commit first.

   AUTHORING GUARD: SKILL.md requires every option in a set to be the same
   number of words and, where possible, characters, so formatting leaks no
   clue. That is easy to get wrong by hand, so this file checks it at load
   and complains loudly in the console. Never ship a lesson with warnings.
   ========================================================================== */

(function () {
  function words(s) { return s.trim().split(/\s+/).length; }
  function chars(s) { return s.trim().length; }

  function audit(quiz, options) {
    var id = quiz.getAttribute("data-quiz-id") || "(unnamed)";
    var texts = options.map(function (li) { return li.textContent; });
    var w = texts.map(words);
    var c = texts.map(chars);

    var wMin = Math.min.apply(null, w), wMax = Math.max.apply(null, w);
    var cMin = Math.min.apply(null, c), cMax = Math.max.apply(null, c);

    if (wMin !== wMax) {
      console.warn(
        "[quiz " + id + "] option word counts differ (" + w.join("/") + "). " +
        "Equal-length options are required — length is a tell."
      );
    } else if (cMax - cMin > 6) {
      console.warn(
        "[quiz " + id + "] option character counts vary by " + (cMax - cMin) +
        " (" + c.join("/") + "). Tighten toward equal length."
      );
    }

    var correct = options.filter(function (li) { return li.dataset.correct === "true"; });
    if (correct.length !== 1) {
      console.error("[quiz " + id + "] needs exactly one option marked data-correct=\"true\", found " + correct.length + ".");
    }
  }

  function build(quiz) {
    var list = quiz.querySelector(".options");
    if (!list) return;

    var options = Array.prototype.slice.call(list.querySelectorAll("li"));
    if (!options.length) return;

    audit(quiz, options);

    var why = quiz.querySelector(".why");
    if (why) { why.hidden = true; }

    var status = document.createElement("p");
    status.className = "quiz-status";
    status.setAttribute("role", "status");
    status.hidden = true;
    quiz.appendChild(status);

    var settled = false;

    options.forEach(function (li) {
      li.tabIndex = 0;
      li.setAttribute("role", "button");

      function choose() {
        if (settled) return;
        settled = true;

        var right = li.dataset.correct === "true";
        li.classList.add(right ? "chosen-right" : "chosen-wrong");

        /* Always reveal where the truth was — a wrong answer that leaves the
           learner guessing teaches nothing. */
        options.forEach(function (o) {
          o.classList.add("settled");
          if (o.dataset.correct === "true") { o.classList.add("is-answer"); }
          o.tabIndex = -1;
        });

        status.textContent = right
          ? "Correct."
          : "Not right — the marked option is the answer.";
        status.className = "quiz-status " + (right ? "ok" : "no");
        status.hidden = false;

        if (why) { why.hidden = false; }

        var id = quiz.getAttribute("data-quiz-id");
        if (id && window.SDS) { window.SDS.recordAnswer(id, right); }
      }

      li.addEventListener("click", choose);
      li.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    Array.prototype.slice.call(document.querySelectorAll(".quiz")).forEach(build);

    /* Record the visit once per page load, for the spacing ladder. */
    var lesson = document.body.getAttribute("data-lesson-id");
    if (lesson && window.SDS) { window.SDS.recordVisit(lesson); }
  });
})();
