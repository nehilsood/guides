import { syncOnce } from "../sync.js";
import { merge, sameState } from "../store.js";

const TOKEN_KEY = "sde2:v1:token";
const REPO_KEY = "sde2:v1:repo";
const LAST_KEY = "sde2:v1:lastsync";
const DEFAULT_REPO = "nehilsood/sde2-progress";
const DELAY_MS = 3000;

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const getToken = () => read(TOKEN_KEY) || "";
export const isValidRepo = (repo) => typeof repo === "string" && /^[\w.-]+\/[\w.-]+$/.test(repo) && !repo.split("/").some((part) => /^\.+$/.test(part));
export const getRepo = () => {
  const stored = read(REPO_KEY);
  return isValidRepo(stored) ? stored : DEFAULT_REPO;
};
export const saveRepo = (repo) => localStorage.setItem(REPO_KEY, repo.trim() || DEFAULT_REPO);
export const saveToken = (token) => localStorage.setItem(TOKEN_KEY, token.trim());
export const forgetToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  setStatus({ kind: "off" });
};

export const lastSync = () => {
  try {
    const last = JSON.parse(read(LAST_KEY));
    return last && typeof last.at === "number" ? last : null;
  } catch {
    return null;
  }
};

export const formatIST = (ms) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date(ms)) + " IST";

// kind: "off" (no token), "syncing", "synced" or "error"
let status = { kind: getToken() ? "syncing" : "off" };
const listeners = new Set();
export const getStatus = () => status;
export const onStatus = (fn) => listeners.add(fn);
const setStatus = (next) => {
  status = next;
  for (const fn of listeners) fn(status);
};

export const describe = ({ kind, reason, at }) => {
  if (kind === "off") return "Sync not set up. Open Settings to add a token.";
  if (kind === "syncing") return "Syncing…";
  if (kind === "synced") return `Synced at ${formatIST(at)}`;
  return `Not synced: ${reason ?? "unknown reason"}${at ? ` (${formatIST(at)})` : ""}`;
};

let ctx = null; // { getState, setState, onChanged }
let running = false;
let dirty = false;
let timer = null;

const runOnce = async () => {
  const result = await syncOnce({ repo: getRepo(), token: getToken(), fetch: (...a) => fetch(...a) }, ctx.getState());
  const current = ctx.getState();
  const merged = merge(current, result.state);
  if (!sameState(merged, current)) {
    ctx.setState(merged);
    ctx.onChanged();
  }
  if (!getToken()) return; // the token was forgotten mid-sync: stay "not set up"
  const at = Date.now();
  const last = result.status === "synced" ? { at, status: "synced" } : { at, status: "error", reason: result.reason };
  localStorage.setItem(LAST_KEY, JSON.stringify(last));
  setStatus({ kind: last.status === "synced" ? "synced" : "error", reason: last.reason, at });
};

export const syncNow = async () => {
  clearTimeout(timer);
  if (!ctx || !getToken()) return setStatus({ kind: "off" });
  if (running) {
    dirty = true;
    return;
  }
  running = true;
  try {
    do {
      dirty = false;
      setStatus({ kind: "syncing" });
      await runOnce();
    } while (dirty && getToken());
  } finally {
    running = false;
  }
};

export const scheduleSync = () => {
  if (!getToken()) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, DELAY_MS);
};

export const startSync = (context) => {
  ctx = context;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") syncNow();
  });
  window.addEventListener("online", syncNow);
  if (getToken()) syncNow();
  else setStatus({ kind: "off" });
};
