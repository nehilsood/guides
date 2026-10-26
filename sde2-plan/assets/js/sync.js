import { merge, empty, COLLECTIONS, isWellFormed, sameState } from "./store.js";

const MAX_ATTEMPTS = 3;

class SyncError extends Error {
  constructor(reason, status) {
    super(reason);
    this.status = status;
  }
}

const toBase64 = (text) => {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (b64) =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

const reasonFor = (status, cfg) => {
  if (status === 401 || status === 403) return `GitHub rejected the token (${status}) — check it in Settings`;
  if (status === 404) return `GitHub could not find ${cfg.repo} — check the repo name and token access in Settings`;
  return `GitHub error ${status}`;
};

const request = async (cfg, method, body) => {
  const url = `https://api.github.com/repos/${cfg.repo}/contents/${cfg.path ?? "progress.json"}`;
  try {
    return await cfg.fetch(url, {
      method,
      cache: "no-store", // GitHub marks contents GETs cacheable for 60 s; a stale sha would defeat the conflict retry
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      ...(body && { body: JSON.stringify(body) }),
    });
  } catch {
    throw new SyncError("offline or network error");
  }
};

const parseProgress = (text) => {
  try {
    const parsed = JSON.parse(text);
    if (isWellFormed(parsed)) return parsed;
  } catch {}
  return null;
};

const parseRemote = (b64) => {
  const parsed = parseProgress(fromBase64(b64));
  if (!parsed) throw new SyncError("progress.json in the repo is not valid JSON");
  return parsed;
};

export const exportJSON = ({ v, days, items, stories }) =>
  JSON.stringify({ v, days, items, stories }, null, 2);

export const importJSON = (text, local) => {
  const parsed = parseProgress(text);
  if (!parsed || !COLLECTIONS.some((c) => c in parsed)) throw new Error("This file is not an SDE2 progress export");
  return merge(local, { days: parsed.days, items: parsed.items, stories: parsed.stories });
};

export const pull = async (cfg) => {
  const res = await request(cfg, "GET");
  if (res.status === 404) return { state: null, sha: null };
  if (!res.ok) throw new SyncError(reasonFor(res.status, cfg), res.status);
  const { content, sha, encoding } = await res.json();
  if (!content || encoding === "none") {
    throw new SyncError("progress.json is too large for the contents API (over 1 MB)");
  }
  return { state: parseRemote(content), sha };
};

export const push = async (cfg, state, sha) => {
  const now = cfg.now ?? (() => new Date());
  const res = await request(cfg, "PUT", {
    message: `progress ${now().toISOString()}`,
    content: toBase64(exportJSON(state)),
    ...(sha && { sha }),
  });
  if (!res.ok) throw new SyncError(reasonFor(res.status, cfg), res.status);
  return (await res.json()).content.sha;
};

const isConflict = (err) => err.status === 409 || err.status === 422;

export const syncOnce = async (cfg, local) => {
  let merged = local;
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { state: remote, sha } = await pull(cfg);
      merged = merge(local, remote ?? empty());
      if (remote && sameState(merged, remote)) return { state: merged, status: "synced" };
      try {
        await push(cfg, merged, sha);
        return { state: merged, status: "synced" };
      } catch (err) {
        if (!(err instanceof SyncError && isConflict(err))) throw err;
      }
    }
    return { state: merged, status: "error", reason: "conflict: the repo changed while syncing, try again" };
  } catch (err) {
    return { state: local, status: "error", reason: err instanceof SyncError ? err.message : "unexpected sync error" };
  }
};
