/* ==========================================================================
   evidence.js — makes the .evidence block remember what you measured.

   Markup contract:

     <div class="evidence" data-evidence-for="0004">
       ...
       <input type="text" data-field="hot_lru" placeholder="e.g. 5 / 200">
       <textarea data-field="why_lfu"></textarea>
       ...
       <div class="earned">
         <p>... survived a 20 000-key sweep
            <span data-fill="hot_lfu">[run step 5]</span> ...</p>
       </div>
     </div>

   Every input and textarea inside the block needs a `data-field`. Anything
   with `data-fill="<field>"` is replaced by that field's value once it is
   entered, so the résumé bullet cannot be read as finished while it still
   contains a number nobody measured.

   Storage is best-effort by design (see store.js): a private window, cleared
   site data, or a browser blocking storage all return nothing, and the block
   has to read correctly in that state. It does — empty fields with visible
   placeholders is its resting state, not an error.
   ========================================================================== */

(function () {
  "use strict";

  var PLACEHOLDER = "placeholder";

  function fieldsOf(block) {
    return Array.prototype.slice.call(
      block.querySelectorAll("input[data-field], textarea[data-field]")
    );
  }

  /* Every `data-fill` target for one field. The résumé bullet usually has
     one; nothing stops a lesson from citing the same number twice. */
  function fillTargets(block, field) {
    return Array.prototype.slice.call(
      block.querySelectorAll('[data-fill="' + field + '"]')
    );
  }

  function paintFill(block, field, value) {
    fillTargets(block, field).forEach(function (target) {
      if (value) {
        /* Keep the original prompt so clearing the field restores it rather
           than leaving the sentence quietly missing a word. */
        if (target.dataset.prompt === undefined) {
          target.dataset.prompt = target.textContent;
        }
        target.textContent = value;
        target.classList.remove(PLACEHOLDER);
      } else if (target.dataset.prompt !== undefined) {
        target.textContent = target.dataset.prompt;
        target.classList.add(PLACEHOLDER);
      }
    });
  }

  function paintInput(input, value) {
    if (value) {
      input.classList.add("filled");
    } else {
      input.classList.remove("filled");
    }
  }

  function wire(block) {
    var lessonId = block.dataset.evidenceFor;
    if (!lessonId) return;

    var store = window.SDS;
    var saved = store ? store.getLessonEvidence(lessonId) : {};

    fieldsOf(block).forEach(function (input) {
      var field = input.dataset.field;
      var value = saved[field];

      if (value !== undefined && value !== null) {
        input.value = value;
      }
      paintInput(input, input.value);
      paintFill(block, field, input.value);

      /* `input` rather than `change`: typed numbers should survive closing
         the tab mid-sentence, which is exactly when it happens. */
      input.addEventListener("input", function () {
        var current = input.value.trim();
        if (store) store.recordEvidence(lessonId, field, current);
        paintInput(input, current);
        paintFill(block, field, current);
      });
    });
  }

  function init() {
    Array.prototype.slice
      .call(document.querySelectorAll(".evidence[data-evidence-for]"))
      .forEach(wire);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
