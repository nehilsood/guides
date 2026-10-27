// What the UI reads out of card text. The cards belong to the lessons session, so tests/js/cards.test.js
// guards this wording (spec §8.3).

const CAP = /\b(\d+)-minute\s+(?:timer|cap)\b/i;
const TRACK = /^(HLD|LLD|AI|DSA|CS)\s+\d+\s*·\s*([\s\S]+)$/;

// "15-minute timer" or "25-minute cap" -> 15 or 25; a plain duration is not a limit.
export const capMinutes = (text) => {
  const m = text.match(CAP);
  return m ? Number(m[1]) : null;
};

// "HLD 1 · What happens?" -> { track: "hld", text: "What happens?" }
export const questionTrack = (q) => {
  const m = q.match(TRACK);
  return m ? { track: m[1].toLowerCase(), text: m[2] } : null;
};

// A short stable key for a piece of text (32-bit FNV-1a), so a saved mark follows its text, not its position.
export const textKey = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
};
