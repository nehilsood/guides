/* ==========================================================================
   latency-calc.js — interactive per-hop latency budget.

   The point of the widget: a budget is arithmetic, not vibes. You cannot
   defend "2.1s median" until you can say which hop owns which milliseconds
   and how much headroom is left before the hard ceiling.

   Markup contract:

     <div class="latency-calc"
          data-budget-ms="8000"
          data-label="Per-turn budget"
          data-hops='[{"name":"VAD close","ms":300,"note":"silence detection"},
                      {"name":"ASR","ms":450,"fixed":true}]'></div>

   Each hop: name, ms, optional note, optional fixed (not editable — a floor
   you do not control, like a network round trip or a TLS handshake).
   ========================================================================== */

(function () {
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function fmt(ms) {
    if (ms >= 1000) return (ms / 1000).toFixed(ms >= 10000 ? 1 : 2) + " s";
    return Math.round(ms) + " ms";
  }

  /* A stable spread of accent-neutral bands, so the bar reads as one object
     rather than a pile of unrelated colours. Hue is fixed; only lightness
     walks, which keeps it legible in both themes and in greyscale print. */
  function band(i, total) {
    var l = 32 + (i / Math.max(1, total - 1)) * 42;
    return "hsl(216 38% " + l.toFixed(1) + "%)";
  }

  function build(root) {
    var budget = parseFloat(root.getAttribute("data-budget-ms")) || 0;
    var label = root.getAttribute("data-label") || "Budget";
    var hops;
    try {
      hops = JSON.parse(root.getAttribute("data-hops") || "[]");
    } catch (e) {
      console.error("[latency-calc] data-hops is not valid JSON", e);
      return;
    }
    if (!hops.length) return;

    root.textContent = "";

    /* ---- summary ---- */
    var summary = el("div", "lc-summary");
    var totalBox = el("div", "lc-figure");
    var totalNum = el("span", "lc-num");
    var totalCap = el("span", "lc-cap", "measured total");
    totalBox.appendChild(totalNum);
    totalBox.appendChild(totalCap);

    var headBox = el("div", "lc-figure");
    var headNum = el("span", "lc-num");
    var headCap = el("span", "lc-cap", "headroom against " + fmt(budget));
    headBox.appendChild(headNum);
    headBox.appendChild(headCap);

    var budgetBox = el("div", "lc-figure lc-quiet");
    var budgetNum = el("span", "lc-num", fmt(budget));
    var budgetCap = el("span", "lc-cap", label);
    budgetBox.appendChild(budgetNum);
    budgetBox.appendChild(budgetCap);

    summary.appendChild(totalBox);
    summary.appendChild(headBox);
    summary.appendChild(budgetBox);
    root.appendChild(summary);

    /* ---- stacked bar ---- */
    var barWrap = el("div", "lc-bar-wrap");
    var bar = el("div", "lc-bar");
    barWrap.appendChild(bar);
    var overflow = el("div", "lc-overflow");
    overflow.hidden = true;
    barWrap.appendChild(overflow);
    root.appendChild(barWrap);

    /* ---- rows ---- */
    var table = el("table", "lc-table");
    var thead = el("thead");
    var hr = el("tr");
    ["", "Hop", "Milliseconds", "Share"].forEach(function (h, i) {
      var th = el("th", i === 2 || i === 3 ? "n" : null, h);
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = el("tbody");
    var inputs = [];

    hops.forEach(function (hop, i) {
      var tr = el("tr");

      var swatchCell = el("td", "lc-swatch-cell");
      var sw = el("span", "lc-swatch");
      sw.style.background = band(i, hops.length);
      swatchCell.appendChild(sw);
      tr.appendChild(swatchCell);

      var nameCell = el("td");
      nameCell.appendChild(el("span", "lc-name", hop.name));
      if (hop.note) { nameCell.appendChild(el("span", "lc-note", hop.note)); }
      if (hop.fixed) { nameCell.appendChild(el("span", "lc-fixed", "not yours to tune")); }
      tr.appendChild(nameCell);

      var msCell = el("td", "n");
      if (hop.fixed) {
        msCell.appendChild(el("span", "lc-static", String(hop.ms)));
        inputs.push({ get: function () { return hop.ms; }, hop: hop, swatch: sw });
      } else {
        var input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.step = "10";
        input.value = hop.ms;
        input.className = "lc-input";
        input.setAttribute("aria-label", hop.name + " milliseconds");
        msCell.appendChild(input);
        inputs.push({ get: function () { return parseFloat(input.value) || 0; }, hop: hop, swatch: sw, input: input });
        input.addEventListener("input", render);
      }
      tr.appendChild(msCell);

      var shareCell = el("td", "n lc-share");
      shareCell.textContent = "—";
      tr.appendChild(shareCell);
      tr._share = shareCell;

      tbody.appendChild(tr);
      inputs[inputs.length - 1].row = tr;
    });

    table.appendChild(tbody);

    var wrap = el("div", "table-wrap");
    wrap.appendChild(table);
    root.appendChild(wrap);

    var hint = el("p", "lc-hint",
      "Edit any figure. The bar, the total and the headroom all follow — that is the whole lesson.");
    root.appendChild(hint);

    function render() {
      var total = inputs.reduce(function (a, x) { return a + x.get(); }, 0);
      totalNum.textContent = fmt(total);

      var head = budget - total;
      headNum.textContent = (head >= 0 ? "" : "−") + fmt(Math.abs(head));
      headBox.classList.toggle("lc-over", head < 0);
      headBox.classList.toggle("lc-ok", head >= 0);
      headCap.textContent = head >= 0
        ? "headroom against " + fmt(budget)
        : "OVER the " + fmt(budget) + " ceiling";

      bar.textContent = "";
      var scale = Math.max(total, budget);

      inputs.forEach(function (x, i) {
        var ms = x.get();
        var pctOfScale = scale > 0 ? (ms / scale) * 100 : 0;
        var seg = el("div", "lc-seg");
        seg.style.width = pctOfScale + "%";
        seg.style.background = band(i, inputs.length);
        seg.title = x.hop.name + ": " + fmt(ms);
        bar.appendChild(seg);

        if (x.row && x.row._share) {
          x.row._share.textContent = total > 0 ? ((ms / total) * 100).toFixed(1) + "%" : "—";
        }
      });

      /* Mark where the ceiling falls, if the total has run past it. */
      if (total > budget && budget > 0) {
        overflow.hidden = false;
        overflow.style.left = ((budget / total) * 100) + "%";
        overflow.textContent = "ceiling";
      } else {
        overflow.hidden = true;
      }
    }

    render();
  }

  document.addEventListener("DOMContentLoaded", function () {
    Array.prototype.slice.call(document.querySelectorAll(".latency-calc")).forEach(build);
  });
})();
