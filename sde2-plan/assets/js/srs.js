import { addDays } from "./dates.js";

export const STEPS = [1, 3, 7, 21];

const LAST = STEPS.length - 1;
const MOVES = { easy: 2, ok: 1 };

export const start = (today) => ({ step: 0, due: addDays(today, STEPS[0]), history: [] });

export const next = (srs, rating, today) => {
  const history = [...srs.history, { date: today, rating, step: srs.step }];
  const step = rating in MOVES ? srs.step + MOVES[rating] : 0;
  if (step > LAST) return { step: LAST, graduated: true, history };
  return { step, due: addDays(today, STEPS[step]), history };
};

export const isDue = (srs, today) => Boolean(srs && !srs.graduated && srs.due <= today);

export const isCold = (srs) =>
  srs.history.some((h) => h.rating in MOVES && STEPS[h.step] >= 7);
