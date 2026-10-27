// The five study subjects and the practice rows, each with its own colour in plan.css (.s-<key>).

export const SUBJECTS = { code: "Coding", sys: "System design", obj: "Object design", ai: "AI", cs: "CS basics", gen: "Practice" };

const BY_TRACK = { dsa: "code", hard: "code", resolve: "code", refresher: "code", hld: "sys", lld: "obj", ai: "ai", "ai-build": "ai", cs: "cs" };

export const subjectOf = (track) => BY_TRACK[track] ?? "gen";
