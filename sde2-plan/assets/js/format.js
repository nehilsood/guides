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
