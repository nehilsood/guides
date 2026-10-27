import { exportJSON, importJSON } from "../sync.js";
import { el, getState, commit, renderHeader } from "./common.js";
import { todayIST } from "../dates.js";
import { isValidRepo, getToken, getRepo, saveRepo, saveToken, forgetToken, syncNow, getStatus, onStatus, describe, lastSync, formatIST } from "./syncwire.js";

const statusLine = el("p", { class: "small", "aria-live": "polite" });
const paintStatus = (st) => {
  const last = lastSync();
  statusLine.textContent =
    st.kind === "off" && !getToken()
      ? "Sync is not set up on this device."
      : st.kind === "syncing" || !last
        ? describe(st)
        : last.status === "synced"
          ? `Last sync: ok, ${formatIST(last.at)}`
          : `Last sync: not synced (${last.reason}), ${formatIST(last.at)}`;
};

const message = el("p", { class: "small", role: "status" });
const backupMessage = el("p", { class: "small", role: "status" });
const sayIn = (line) => (text, cls = "ok") => {
  line.className = `small ${cls}`;
  line.textContent = text;
};
const say = sayIn(message);
const sayBackup = sayIn(backupMessage);

const field = (id, label, input) => el("div", {}, el("label", { class: "field", for: id, text: label }), input);

const repoInput = el("input", { id: "repo", class: "text-input", type: "text", value: getRepo(), autocomplete: "off", spellcheck: "false" });
const tokenInput = el("input", { id: "token", class: "text-input", type: "password", autocomplete: "new-password", placeholder: getToken() ? "Token saved on this device" : "Paste a token", spellcheck: "false" });

const save = () => {
  const repo = repoInput.value.trim();
  if (repo && !isValidRepo(repo)) return say("Use owner/name, e.g. nehilsood/sde2-progress", "err");
  saveRepo(repo);
  repoInput.value = getRepo();
  if (tokenInput.value.trim()) saveToken(tokenInput.value);
  tokenInput.value = "";
  tokenInput.placeholder = getToken() ? "Token saved on this device" : "Paste a token";
  say(getToken() ? "Saved." : "Repo saved. Add a token to turn sync on.");
  syncNow();
};

const forget = () => {
  forgetToken();
  tokenInput.placeholder = "Paste a token";
  say("Token removed from this device.");
};

const download = () => {
  const name = `sde2-progress-${todayIST(new Date())}.json`;
  const url = URL.createObjectURL(new Blob([exportJSON(getState())], { type: "application/json" }));
  const link = el("a", { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const importFile = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const merged = importJSON(text, getState());
    commit(() => merged);
    sayBackup("Imported. Your progress now includes everything in that file.");
  } catch (err) {
    sayBackup(err.message, "err");
  }
  event.target.value = "";
};

// Appearance: Auto follows the device. theme.js applies the saved choice before first paint on every page.
const THEME_KEY = "sde2:v1:theme";
const savedTheme = () => {
  try {
    return localStorage.getItem(THEME_KEY) ?? "auto";
  } catch {
    return "auto";
  }
};
const themeButtons = [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]].map(([value, label]) =>
  el("button", { type: "button", value, "aria-pressed": String(value === savedTheme()), onclick: () => setTheme(value), text: label }),
);
const setTheme = (value) => {
  try {
    if (value === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, value);
  } catch {} // storage blocked: the choice holds for this page only
  if (value === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", value);
  for (const b of themeButtons) b.setAttribute("aria-pressed", String(b.value === value));
};

renderHeader("settings.html");
onStatus(paintStatus);
paintStatus(getStatus());
document.getElementById("app").replaceChildren(
  el("h1", { text: "Settings" }),
  el(
    "section",
    { class: "box" },
    el("h2", { text: "Sync" }),
    el("p", { class: "small", text: "Use a fine-grained GitHub token with access to only the progress repo, Contents: Read and write." }),
    field("repo", "Progress repo", repoInput),
    field("token", "Token", tokenInput),
    el("p", {}, el("span", { class: "btns" }, el("button", { type: "button", class: "button", onclick: save, text: "Save" }), el("button", { type: "button", class: "btn", onclick: () => syncNow(), text: "Sync now" }), el("button", { type: "button", class: "btn", onclick: forget, text: "Forget token on this device" }))),
    statusLine,
    message,
  ),
  el(
    "section",
    { class: "box" },
    el("h2", { text: "Appearance" }),
    el("p", { class: "small", text: "Auto follows your device's light or dark setting." }),
    el("div", { class: "seg", role: "group", "aria-label": "Colour theme" }, themeButtons),
  ),
  el(
    "section",
    { class: "box" },
    el("h2", { text: "Backup" }),
    el("p", { class: "small", text: "Export saves your progress, notes and stories to a file. It never includes the token." }),
    el("p", {}, el("button", { type: "button", class: "btn", onclick: download, text: "Export progress" })),
    field("import", "Import a progress file", el("input", { id: "import", type: "file", accept: "application/json,.json", onchange: importFile })),
    backupMessage,
  ),
);
