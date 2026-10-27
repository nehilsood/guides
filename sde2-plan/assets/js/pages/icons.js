// Line icons, drawn inline. Path data from Lucide (lucide.dev, ISC licence), except `mark`, the site's own.

const SVG = "http://www.w3.org/2000/svg";

export const PATHS = {
  home: ["M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8", "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
  today: ["M8 2v4", "M16 2v4", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M3 10h18", "m9 16 2 2 4-4"],
  revise: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5"],
  outline: ["M3 6h.01", "M3 12h.01", "M3 18h.01", "M8 6h13", "M8 12h13", "M8 18h13"],
  stories: ["M12 7v14", "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"],
  settings: [
    "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
    "M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
  ],
  bookmark: ["m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"],
  article: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M10 9H8", "M16 13H8", "M16 17H8"],
  video: ["M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0", "m10 8 6 4-6 4V8z"],
  check: ["M20 6 9 17l-5-5"],
  "chevron-left": ["m15 18-6-6 6-6"],
  "chevron-right": ["m9 18 6-6-6-6"],
  external: ["M7 7h10v10", "M7 17 17 7"],
  timer: ["M10 2h4", "M12 14l3-3", "M4 14a8 8 0 1 0 16 0a8 8 0 1 0-16 0"],
  play: ["M6 3 20 12 6 21 6 3z"],
  pause: ["M15 4h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z", "M7 4h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"],
  // A day bar inside a rounded square: two finished segments and the one in progress.
  mark: ["M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z", "M7 12h2", "M12 12h2", "M17 12h0"],
};

const svgNode = (tag, attrs) => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

// The progress ring: a track, an arc that fills by --fill (set on the row), and a filled disc with a tick when
// done. plan.css's .ring --c must equal RING.c (tests/js/icons.test.js).
export const RING = { size: 30, r: 12.5, c: 2 * Math.PI * 12.5 };

export const ring = () => {
  const mid = RING.size / 2;
  const svg = svgNode("svg", { class: "ring", viewBox: `0 0 ${RING.size} ${RING.size}`, "aria-hidden": "true" });
  svg.append(
    svgNode("circle", { class: "ring-track", cx: mid, cy: mid, r: RING.r }),
    svgNode("circle", { class: "ring-fill", cx: mid, cy: mid, r: RING.r }),
    svgNode("circle", { class: "ring-disc", cx: mid, cy: mid, r: mid }),
    svgNode("path", { class: "ring-tick", d: "M9.5 15.5l3.5 3.5 7.5-8" }),
  );
  return svg;
};

// An inline icon. Decorative unless it gets a label, in which case it is announced as an image.
export const icon = (name, label) => {
  const svg = document.createElementNS(SVG, "svg");
  for (const [k, v] of Object.entries({ class: "icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.75", "stroke-linecap": "round", "stroke-linejoin": "round" }))
    svg.setAttribute(k, v);
  if (label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  } else svg.setAttribute("aria-hidden", "true");
  for (const d of PATHS[name]) {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
};
