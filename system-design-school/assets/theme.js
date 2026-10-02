/* ==========================================================================
   theme.js — light/dark toggle, loaded by every page.
   Three states, matching the CSS: no stamp (follow OS), light, dark.
   ========================================================================== */

(function () {
  var KEY = "sds:v1:theme";

  function stored() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function apply(value) {
    if (value === "light" || value === "dark") {
      document.documentElement.setAttribute("data-theme", value);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  /* Apply before first paint where possible. */
  apply(stored());

  function label() {
    var v = stored();
    return v === "dark" ? "dark" : v === "light" ? "light" : "auto";
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.setAttribute("aria-label", "Cycle colour theme: auto, light, dark");
    btn.textContent = label();

    btn.addEventListener("click", function () {
      var order = [null, "light", "dark"];
      var next = order[(order.indexOf(stored() || null) + 1) % order.length];
      try {
        if (next) { window.localStorage.setItem(KEY, next); }
        else { window.localStorage.removeItem(KEY); }
      } catch (e) { /* storage blocked; apply for this page only */ }
      apply(next);
      btn.textContent = label();
    });

    document.body.appendChild(btn);
  });
})();
