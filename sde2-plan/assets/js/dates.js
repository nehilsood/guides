export const START = "2026-11-02";
export const DAYS = 180;

const MS_PER_DAY = 86400000;
const DAY_ZERO = Date.UTC(2026, 10, 1);

const parse = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

const format = (ms) => new Date(ms).toISOString().slice(0, 10);

const istFormat = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

export const todayIST = (now) => {
  const p = Object.fromEntries(istFormat.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day}`;
};

export const dayNumber = (dateStr) => Math.round((parse(dateStr) - DAY_ZERO) / MS_PER_DAY);

export const dateOf = (day) => format(DAY_ZERO + day * MS_PER_DAY);

export const addDays = (dateStr, n) => format(parse(dateStr) + n * MS_PER_DAY);
