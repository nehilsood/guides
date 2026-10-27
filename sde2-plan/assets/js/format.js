export const formatViews = (n) => {
  const thousands = Math.round(n / 1e3);
  if (n >= 1e6 || thousands >= 1000) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M views`;
  if (n >= 1e3) return `${thousands}K views`;
  return `${n} views`;
};

export const formatHours = (minutes) => (minutes > 0 ? `≈${Math.round((minutes / 60) * 10) / 10} hrs` : "");

// Card text marks inline code with backticks; an unmatched backtick stays plain text.
export const codeParts = (text) => {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), code: false });
    parts.push({ text: m[1], code: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), code: false });
  return parts;
};

// Card text with its backticks dropped, for labels.
export const plain = (text) => codeParts(text).map((p) => p.text).join("");

export const sentence = (text) => (/[.…?!]$/.test(text) ? text : `${text}.`);

// "Two pointers: keep two indexes…" -> { lead: "Two pointers", rest: "keep two indexes…" }. Only a short name
// (1 to 5 words, no code) before the first ": " counts as a lead-in; anything else is null.
export const leadIn = (text) => {
  const at = text.indexOf(": ");
  if (at <= 0) return null;
  const lead = text.slice(0, at);
  if (lead.length > 40 || lead.includes("`") || lead.trim().split(/\s+/).length > 5) return null;
  return { lead, rest: text.slice(at + 2) };
};
